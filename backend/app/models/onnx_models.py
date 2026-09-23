"""onnxruntime wrappers for the three learned detectors. Pre-processing lives here so training
(`training/stages/export.py` evaluation) and inference share it exactly."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

FACE_SIZE = 256
FACE_MEAN = np.array([0.5, 0.5, 0.5], np.float32)
FACE_STD = np.array([0.5, 0.5, 0.5], np.float32)
CLIP_SIZE = 224
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)
AASIST_SAMPLES = 64600
AASIST_HOP = 32300


def make_session(path: str | Path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.intra_op_num_threads = 0
    return ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])


def preprocess_face(crops_rgb: list[np.ndarray]) -> np.ndarray:
    x = np.stack([c.astype(np.float32) / 255.0 for c in crops_rgb])
    x = (x - FACE_MEAN) / FACE_STD
    return np.ascontiguousarray(x.transpose(0, 3, 1, 2))


def preprocess_clip(img_rgb: np.ndarray) -> np.ndarray:
    """Resize shortest side to 224 (bicubic) + center crop — CLIP's standard transform. Returns HWC float."""
    h, w = img_rgb.shape[:2]
    s = CLIP_SIZE / min(h, w)
    r = cv2.resize(img_rgb, (max(CLIP_SIZE, round(w * s)), max(CLIP_SIZE, round(h * s))), interpolation=cv2.INTER_CUBIC)
    y0 = (r.shape[0] - CLIP_SIZE) // 2
    x0 = (r.shape[1] - CLIP_SIZE) // 2
    return r[y0:y0 + CLIP_SIZE, x0:x0 + CLIP_SIZE].astype(np.float32) / 255.0


def clip_tensor(batch_hwc01: np.ndarray) -> np.ndarray:
    x = (batch_hwc01 - CLIP_MEAN) / CLIP_STD
    return np.ascontiguousarray(x.transpose(0, 3, 1, 2).astype(np.float32))


class FaceCNN:
    """EfficientNet-B4. Outputs: logits (N,2) [real, fake] and cam (N,8,8) = (w_fake − w_real)·features."""

    def __init__(self, session: ort.InferenceSession, version: str) -> None:
        self.session = session
        self.version = version

    def predict(self, crops_rgb: list[np.ndarray], batch: int = 16) -> tuple[np.ndarray, np.ndarray]:
        logits, cams = [], []
        for i in range(0, len(crops_rgb), batch):
            out = self.session.run(["logits", "cam"], {"input": preprocess_face(crops_rgb[i:i + batch])})
            logits.append(out[0])
            cams.append(out[1])
        return np.concatenate(logits), np.concatenate(cams)


class UnivFD:
    """CLIP ViT-L/14 image embedding (768-d) + linear probe; logit = w·e + b (fake)."""

    def __init__(self, session: ort.InferenceSession, probe: dict, version: str) -> None:
        self.session = session
        self.w = np.asarray(probe["w"], np.float32)
        self.b = float(probe["b"])
        self.version = version

    def embed(self, batch_hwc01: np.ndarray, batch: int = 16) -> np.ndarray:
        outs = []
        for i in range(0, len(batch_hwc01), batch):
            outs.append(self.session.run(["embedding"], {"pixel_values": clip_tensor(batch_hwc01[i:i + batch])})[0])
        return np.concatenate(outs)

    def logits(self, emb: np.ndarray) -> np.ndarray:
        return emb @ self.w + self.b


class AASIST:
    """AASIST-L. Input (1, 64600) float32 at 16 kHz. Output logits (1,2): index 0 spoof, 1 bona fide."""

    def __init__(self, session: ort.InferenceSession, version: str) -> None:
        self.session = session
        self.version = version

    @staticmethod
    def windows(y: np.ndarray) -> list[tuple[float, np.ndarray]]:
        if y.size == 0:
            return []
        if y.size < AASIST_SAMPLES:
            reps = int(np.ceil(AASIST_SAMPLES / y.size))
            return [(y.size / 2 / 16000, np.tile(y, reps)[:AASIST_SAMPLES])]
        out = []
        for start in range(0, y.size - AASIST_SAMPLES + 1, AASIST_HOP):
            out.append(((start + AASIST_SAMPLES / 2) / 16000, y[start:start + AASIST_SAMPLES]))
        tail = y.size - AASIST_SAMPLES
        if tail % AASIST_HOP != 0:
            out.append(((tail + AASIST_SAMPLES / 2) / 16000, y[tail:]))
        return out

    def spoof_logits(self, y: np.ndarray) -> list[tuple[float, float]]:
        res = []
        for t, w in self.windows(y):
            out = self.session.run(["logits"], {"waveform": w[None, :].astype(np.float32)})[0][0]
            res.append((float(t), float(out[0] - out[1])))
        return res


def load_probe(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())
