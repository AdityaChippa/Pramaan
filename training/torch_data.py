"""PyTorch datasets for fine-tuning (face crops, audio windows)."""
from __future__ import annotations

import random
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset

from app.models.onnx_models import AASIST_SAMPLES, FACE_MEAN, FACE_STD, FACE_SIZE


class FaceCropDataset(Dataset):
    """Items: (crop_path, label). Train-time augmentation: flip, small colour jitter, JPEG re-encode, blur."""

    def __init__(self, items: list[tuple[str, int]], train: bool) -> None:
        self.items = items
        self.train = train

    def __len__(self) -> int:
        return len(self.items)

    def _augment(self, img: np.ndarray) -> np.ndarray:
        if random.random() < 0.5:
            img = img[:, ::-1]
        if random.random() < 0.3:
            q = random.randint(50, 95)
            ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
            if ok:
                img = cv2.imdecode(enc, cv2.IMREAD_COLOR)
        if random.random() < 0.2:
            img = cv2.GaussianBlur(img, (3, 3), 0)
        if random.random() < 0.3:
            alpha = random.uniform(0.85, 1.15)
            beta = random.uniform(-15, 15)
            img = np.clip(img.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
        return np.ascontiguousarray(img)

    def __getitem__(self, i: int):
        path, label = self.items[i]
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        if img is None:
            img = np.zeros((FACE_SIZE, FACE_SIZE, 3), np.uint8)
        if img.shape[:2] != (FACE_SIZE, FACE_SIZE):
            img = cv2.resize(img, (FACE_SIZE, FACE_SIZE), interpolation=cv2.INTER_AREA)
        if self.train:
            img = self._augment(img)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        x = ((rgb - FACE_MEAN) / FACE_STD).transpose(2, 0, 1)
        return torch.from_numpy(np.ascontiguousarray(x)), torch.tensor(label, dtype=torch.long)


class AudioWindowDataset(Dataset):
    """Items: (audio_path, label). Decodes at 16 kHz mono with the engine's decoder; random 64600-sample
    crop when training, centre crop when evaluating; short clips are tiled like the engine does.
    Target follows AASIST: class 0 = spoof (fake), class 1 = bona fide (real)."""

    def __init__(self, items: list[tuple[str, int]], train: bool, max_seconds: float = 30.0) -> None:
        self.items = items
        self.train = train
        self.max_seconds = max_seconds
        self.cache: dict[str, np.ndarray] = {}

    def __len__(self) -> int:
        return len(self.items)

    def _load(self, path: str) -> np.ndarray:
        if path not in self.cache:
            from app.pipeline.media import decode_audio

            y, _ = decode_audio(path, 16000, self.max_seconds)
            if len(self.cache) < 2000:
                self.cache[path] = y
            return y
        return self.cache[path]

    def __getitem__(self, i: int):
        path, label = self.items[i]
        try:
            y = self._load(path)
        except Exception:  # noqa: BLE001 — unreadable file becomes silence; logged by the stage's pre-scan
            y = np.zeros(AASIST_SAMPLES, np.float32)
        if y.size < AASIST_SAMPLES:
            y = np.tile(y if y.size else np.zeros(1, np.float32), int(np.ceil(AASIST_SAMPLES / max(y.size, 1))))[:AASIST_SAMPLES]
        elif self.train:
            s = random.randint(0, y.size - AASIST_SAMPLES)
            y = y[s:s + AASIST_SAMPLES]
        else:
            s = (y.size - AASIST_SAMPLES) // 2
            y = y[s:s + AASIST_SAMPLES]
        target = 0 if label == 1 else 1
        return torch.from_numpy(y.astype(np.float32)), torch.tensor(target, dtype=torch.long)


def stratified_cap(items: list[tuple[str, int]], cap: int, seed: int) -> list[tuple[str, int]]:
    if len(items) <= cap:
        return items
    rng = random.Random(seed)
    by = {0: [x for x in items if x[1] == 0], 1: [x for x in items if x[1] == 1]}
    out = []
    for lab, lst in by.items():
        rng.shuffle(lst)
        out += lst[: int(cap * len(lst) / len(items))]
    rng.shuffle(out)
    return out


def exists(p: str) -> bool:
    return Path(p).exists()
