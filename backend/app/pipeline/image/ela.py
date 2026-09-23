"""Error Level Analysis at JPEG quality 90 (§5.1.5)."""
from __future__ import annotations

import cv2
import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.faces import FACE_OVAL, Face, polygon_mask
from app.pipeline.types import IndicatorResult

QUALITY = 90
BLOCK = 32


def analyze_ela(img_bgr: np.ndarray, faces: list[Face], bag: ArtifactBag) -> IndicatorResult:
    ok, enc = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, QUALITY])
    if not ok:
        raise RuntimeError("JPEG re-encoding failed")
    rec = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    diff = np.abs(img_bgr.astype(np.int16) - rec.astype(np.int16)).astype(np.float32)
    ela = diff.mean(axis=2)
    peak = float(diff.max())
    vis = np.clip(diff * (255.0 / peak if peak > 0 else 1.0), 0, 255).astype(np.uint8)

    h, w = ela.shape
    bh, bw = h // BLOCK, w // BLOCK
    features: dict[str, float] = {}
    details: dict[str, object] = {"quality": QUALITY, "max_abs_diff": peak, "mean_error_level": round(float(ela.mean()), 4)}
    if bh >= 2 and bw >= 2:
        blocks = ela[: bh * BLOCK, : bw * BLOCK].reshape(bh, BLOCK, bw, BLOCK).mean(axis=(1, 3))
        med = float(np.median(blocks))
        mad = 1.4826 * float(np.median(np.abs(blocks - med))) + 1e-6
        features["ela_block_outlier"] = float((np.abs(blocks - med) / mad > 3.5).mean())

    face = faces[0] if faces else None
    if face is not None:
        if face.landmarks is not None:
            fmask = polygon_mask((h, w), face.landmarks[FACE_OVAL, :2])
        else:
            fmask = np.zeros((h, w), bool)
            x, y, fw, fh = face.box
            fmask[y:y + fh, x:x + fw] = True
        if fmask.sum() > 100 and (~fmask).sum() > 100:
            f_mean, b_mean = float(ela[fmask].mean()), float(ela[~fmask].mean())
            lr = float(np.log((f_mean + 1e-3) / (b_mean + 1e-3)))
            features["ela_log_ratio"] = lr
            features["ela_log_ratio_abs"] = abs(lr)
            details.update({"face_mean": round(f_mean, 4), "background_mean": round(b_mean, 4)})
            contours, _ = cv2.findContours(fmask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(vis, contours, -1, (255, 255, 255), 1)
    if not features:
        return IndicatorResult.na("ela", "Image too small for block statistics and no face region")
    key = bag.add("ela", f"Error level analysis (JPEG q{QUALITY})", "ela", vis, original_key="original_preview")
    value = features.get("ela_log_ratio_abs", features.get("ela_block_outlier", 0.0))
    return IndicatorResult(id="ela", value=value, unit="|log ratio|" if "ela_log_ratio_abs" in features else "outlier fraction",
                           features=features, details=details, artifact_key=key)
