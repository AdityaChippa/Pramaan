"""AASIST-L spoof score timeline on 4 s windows with 50% overlap (§5.3.1)."""
from __future__ import annotations

import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult


def analyze_aasist(model, y16k: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    if model is None:
        return IndicatorResult.na("aasist", "AASIST-L model not available — publish it with backend/scripts/publish_pretrained.py or training")
    if y16k.size < 16000:
        return IndicatorResult.na("aasist", "Audio shorter than 1 s")
    res = model.spoof_logits(y16k)
    t = np.array([r[0] for r in res])
    logits = np.array([r[1] for r in res])
    probs = 1 / (1 + np.exp(-np.clip(logits, -40, 40)))
    bag.series["audio_spoof"] = [{"t": round(float(a), 3), "p": round(float(b), 6)} for a, b in zip(t, probs)]
    plot = line_plot([(t, probs, "spoof probability")], "AASIST-L spoof score per window", "window centre (s)", "p(spoof)",
                     hlines=[(0.5, "0.5")])
    key = bag.add("aasist_timeline", "AASIST-L spoof timeline", "aasist", plot)
    return IndicatorResult(
        id="aasist", value=float(probs.mean()), unit="spoof prob",
        features={"mean_logit": float(logits.mean()), "max_logit": float(logits.max())},
        details={"windows": len(res), "max_window_prob": round(float(probs.max()), 6),
                 "max_window_t": round(float(t[int(np.argmax(probs))]), 3), "model_version": model.version},
        artifact_key=key,
    )
