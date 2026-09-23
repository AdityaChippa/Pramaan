"""Face-manipulation CNN with in-graph class activation maps (§5.1.1)."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.models.onnx_models import FACE_SIZE, FaceCNN
from app.pipeline.artifacts import ArtifactBag
from app.pipeline.faces import Face, crop_face
from app.pipeline.plots import overlay_heatmap
from app.pipeline.types import IndicatorResult

MODEL_MISSING = "Face CNN model not available — publish it with backend/scripts/publish_pretrained.py or training"


@dataclass
class FaceScore:
    face: Face
    crop_box: tuple[int, int, int, int]
    logit: float  # fake − real
    cam: np.ndarray  # (h, w) raw CAM


def sigmoid(x: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -40, 40)))


def score_faces(model: FaceCNN, img_bgr: np.ndarray, faces: list[Face]) -> list[FaceScore]:
    if not faces:
        return []
    crops, boxes = [], []
    for f in faces:
        crop, cb = crop_face(img_bgr, f.box, FACE_SIZE)
        crops.append(crop)
        boxes.append(cb)
    logits, cams = model.predict(crops)
    return [FaceScore(face=f, crop_box=b, logit=float(l[1] - l[0]), cam=c)
            for f, b, l, c in zip(faces, boxes, logits, cams)]


def cam_heat_full(img_shape: tuple[int, ...], scores: list[FaceScore]) -> np.ndarray:
    """Maps positive-evidence CAMs (ReLU, normalised per face by its max) back to full-frame coordinates."""
    h, w = img_shape[:2]
    heat = np.zeros((h, w), np.float32)
    for s in scores:
        cam = np.maximum(s.cam.astype(np.float32), 0)
        peak = float(cam.max())
        if peak <= 1e-9:
            continue
        cam = cam / peak * float(sigmoid(s.logit))
        x0, y0, side, _ = s.crop_box
        up = cv2.resize(cam, (side, side), interpolation=cv2.INTER_CUBIC)
        region = heat[y0:y0 + side, x0:x0 + side]
        np.maximum(region, up[: region.shape[0], : region.shape[1]], out=region)
    return heat


def draw_boxes(img: np.ndarray, scores: list[FaceScore]) -> np.ndarray:
    out = img.copy()
    for s in scores:
        x, y, bw, bh = s.face.box
        p = float(sigmoid(s.logit))
        color = (94, 77, 255) if p >= 0.5 else (151, 220, 61)
        cv2.rectangle(out, (x, y), (x + bw, y + bh), color, 2)
        cv2.putText(out, f"p={p:.3f}", (x, max(14, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    return out


def analyze_face_cnn_image(model: FaceCNN | None, img_bgr: np.ndarray, faces: list[Face], bag: ArtifactBag) -> IndicatorResult:
    if model is None:
        return IndicatorResult.na("face_cnn", MODEL_MISSING)
    if not faces:
        return IndicatorResult.na("face_cnn", "No face detected (MediaPipe Face Detection)")
    scores = score_faces(model, img_bgr, faces)
    logits = np.array([s.logit for s in scores])
    heat = cam_heat_full(img_bgr.shape, scores)
    overlay = draw_boxes(overlay_heatmap(img_bgr, heat), scores)
    key = bag.add("face_cnn_cam", "Face CNN class activation map", "face_cnn", overlay, original_key="original_preview")
    return IndicatorResult(
        id="face_cnn",
        value=float(sigmoid(logits.max())),
        unit="fake prob",
        features={"mean_logit": float(logits.mean()), "p90_logit": float(np.percentile(logits, 90))},
        details={"faces": [{"box": list(s.face.box), "detector_score": round(s.face.score, 4),
                            "fake_prob": round(float(sigmoid(s.logit)), 6)} for s in scores],
                 "model_version": model.version},
        artifact_key=key,
    )
