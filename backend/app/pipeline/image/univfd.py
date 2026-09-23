"""UnivFD generic AI-generated image detector with a bounded occlusion map (§5.1.2)."""
from __future__ import annotations

import cv2
import numpy as np

from app.models.onnx_models import CLIP_MEAN, CLIP_SIZE, UnivFD, preprocess_clip
from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import overlay_heatmap
from app.pipeline.types import IndicatorResult


def _center_crop_box(h: int, w: int) -> tuple[int, int, int]:
    side = min(h, w)
    return (w - side) // 2, (h - side) // 2, side


def analyze_univfd(model: UnivFD | None, img_bgr: np.ndarray, bag: ArtifactBag, grid: int = 7) -> IndicatorResult:
    if model is None:
        return IndicatorResult.na("univfd", "UnivFD model not available — publish it with backend/scripts/publish_pretrained.py or training")
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    base = preprocess_clip(rgb)
    cell = CLIP_SIZE // grid
    batch = [base]
    for gy in range(grid):
        for gx in range(grid):
            occ = base.copy()
            y1 = CLIP_SIZE if gy == grid - 1 else (gy + 1) * cell
            x1 = CLIP_SIZE if gx == grid - 1 else (gx + 1) * cell
            occ[gy * cell:y1, gx * cell:x1] = CLIP_MEAN  # occlude with the dataset mean (zero after normalisation)
            batch.append(occ)
    emb = model.embed(np.stack(batch))
    logits = model.logits(emb)
    base_logit = float(logits[0])
    delta = (base_logit - logits[1:]).reshape(grid, grid)  # > 0: the cell supported the "fake" decision
    pos = np.maximum(delta, 0)
    heat_small = pos / pos.max() if pos.max() > 1e-9 else np.zeros_like(pos)

    h, w = img_bgr.shape[:2]
    x0, y0, side = _center_crop_box(h, w)
    heat = np.zeros((h, w), np.float32)
    heat[y0:y0 + side, x0:x0 + side] = cv2.resize(heat_small.astype(np.float32), (side, side), interpolation=cv2.INTER_NEAREST)
    overlay = overlay_heatmap(img_bgr, heat)
    cv2.rectangle(overlay, (x0, y0), (x0 + side - 1, y0 + side - 1), (200, 200, 200), 1)
    key = bag.add("univfd_occlusion", f"UnivFD {grid}×{grid} occlusion map", "univfd", overlay, original_key="original_preview")
    return IndicatorResult(
        id="univfd",
        value=float(1 / (1 + np.exp(-base_logit))),
        unit="fake prob",
        features={"logit": base_logit},
        details={"occlusion_delta_logit": np.round(delta, 4).tolist(), "grid": grid,
                 "analyzed_region": {"x": x0, "y": y0, "side": side}, "model_version": model.version},
        artifact_key=key,
    )
