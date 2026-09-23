"""Blending-boundary discontinuity (Face Warping Artifacts idea, §5.1.4)."""
from __future__ import annotations

import cv2
import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.faces import FACE_OVAL, Face, iod, polygon_mask
from app.pipeline.plots import normalize01, overlay_heatmap
from app.pipeline.types import IndicatorResult


def analyze_blending(img_bgr: np.ndarray, faces: list[Face], bag: ArtifactBag) -> IndicatorResult:
    face = next((f for f in faces if f.landmarks is not None), None)
    if face is None:
        return IndicatorResult.na("blend_boundary", "No face mesh detected (MediaPipe Face Mesh)")
    lm = face.landmarks
    h, w = img_bgr.shape[:2]
    mask = polygon_mask((h, w), lm[FACE_OVAL, :2]).astype(np.uint8)
    k = max(3, int(round(0.12 * iod(lm))))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1))
    inner = cv2.erode(mask, kernel).astype(bool)
    ring = (cv2.dilate(mask, kernel) - cv2.erode(mask, kernel)).astype(bool)
    if inner.sum() < 200 or ring.sum() < 200:
        return IndicatorResult.na("blend_boundary", "Face too small for boundary analysis")

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    lap = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)
    residual = gray - cv2.GaussianBlur(gray, (0, 0), 1.0)
    sharp_in, sharp_ring = float(lap[inner].var()), float(lap[ring].var())
    noise_in, noise_ring = float(residual[inner].std()), float(residual[ring].std())
    eps = 1e-6
    sharp_lr = float(np.log((sharp_in + eps) / (sharp_ring + eps)))
    noise_lr = float(np.log((noise_in + eps) / (noise_ring + eps)))

    local = cv2.boxFilter(lap * lap, -1, (9, 9))
    heat = normalize01(np.log1p(local))
    heat[~(ring | inner)] *= 0.25
    overlay = overlay_heatmap(img_bgr, heat, 0.5)
    contours, _ = cv2.findContours(ring.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, (255, 255, 255), 1)
    key = bag.add("blend_boundary", "Boundary-ring sharpness map", "blend_boundary", overlay, original_key="original_preview")
    return IndicatorResult(
        id="blend_boundary",
        value=abs(sharp_lr) + abs(noise_lr),
        unit="|log ratio|",
        features={"sharpness_log_ratio": sharp_lr, "noise_log_ratio": noise_lr,
                  "sharpness_log_ratio_abs": abs(sharp_lr), "noise_log_ratio_abs": abs(noise_lr)},
        details={"laplacian_var_inner": round(sharp_in, 3), "laplacian_var_ring": round(sharp_ring, 3),
                 "noise_std_inner": round(noise_in, 4), "noise_std_ring": round(noise_ring, 4), "ring_px": k},
        artifact_key=key,
    )
