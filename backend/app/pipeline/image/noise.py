"""Noise residual consistency (§5.1.6)."""
from __future__ import annotations

import cv2
import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import normalize01, overlay_heatmap
from app.pipeline.types import IndicatorResult

BLOCK = 32
Z_OUTLIER = 3.0


def analyze_noise(img_bgr: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    residual = gray.astype(np.float32) - cv2.medianBlur(gray, 3).astype(np.float32)
    h, w = residual.shape
    bh, bw = h // BLOCK, w // BLOCK
    if bh < 3 or bw < 3:
        return IndicatorResult.na("noise_residual", "Image smaller than 3×3 analysis blocks")
    blocks = residual[: bh * BLOCK, : bw * BLOCK].reshape(bh, BLOCK, bw, BLOCK)
    var = blocks.var(axis=(1, 3))
    logv = np.log(var + 1e-3)
    med = float(np.median(logv))
    mad = 1.4826 * float(np.median(np.abs(logv - med))) + 1e-6
    z = (logv - med) / mad
    outliers = np.abs(z) > Z_OUTLIER
    frac = float(outliers.mean())

    heat = normalize01(np.abs(z))
    heat_full = cv2.resize(heat.astype(np.float32), (bw * BLOCK, bh * BLOCK), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((h, w), np.float32)
    canvas[: bh * BLOCK, : bw * BLOCK] = heat_full
    overlay = overlay_heatmap(img_bgr, canvas, 0.55)
    for (by, bx) in zip(*np.nonzero(outliers)):
        cv2.rectangle(overlay, (int(bx) * BLOCK, int(by) * BLOCK), ((int(bx) + 1) * BLOCK - 1, (int(by) + 1) * BLOCK - 1), (255, 255, 255), 1)
    key = bag.add("noise_residual", "Noise-variance consistency map", "noise_residual", overlay, original_key="original_preview")
    return IndicatorResult(
        id="noise_residual",
        value=frac,
        unit="outlier fraction",
        features={"outlier_fraction": frac, "max_abs_z": float(np.abs(z).max()), "log_var_mad": mad},
        details={"blocks": [int(bh), int(bw)], "outlier_blocks": int(outliers.sum()), "z_threshold": Z_OUTLIER},
        artifact_key=key,
    )
