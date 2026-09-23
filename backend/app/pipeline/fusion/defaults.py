"""Documented default fusion weights (used until a calibrated fusion model is published).

x_i = logit(score_i) clipped to [-8, 8]; z = b + Σ (w_i·x_i·m_i + v_i·m_i); p = σ(a·z + β).
Defaults: a = 1, β = 0, b = 0, v = 0. Learned detectors weigh ≈1, handcrafted cues 0.3–0.6,
the lighting heuristic 0.15. Thresholds 0.30 / 0.70 until validation-derived ones exist.
"""
from __future__ import annotations

from typing import Any

from app.pipeline.scoring import DEFAULT_CALIBRATORS

COMBOS: dict[str, list[str]] = {
    "image": ["face_cnn", "univfd", "freq_spectrum", "blend_boundary", "ela", "noise_residual", "lighting", "exif_metadata", "c2pa"],
    "video": ["face_cnn", "landmark_jitter", "blink", "rppg", "container", "c2pa"],
    "video_audio": ["face_cnn", "landmark_jitter", "blink", "rppg", "av_sync", "container", "c2pa",
                    "aasist", "audio_spectral", "prosody", "breath_pause", "splice"],
    "audio": ["aasist", "audio_spectral", "prosody", "breath_pause", "splice", "container", "c2pa"],
    "live": ["face_cnn", "landmark_jitter", "blink", "aasist"],
}

DEFAULT_WEIGHTS: dict[str, float] = {
    "face_cnn": 1.0, "univfd": 0.9, "freq_spectrum": 0.5, "blend_boundary": 0.4, "ela": 0.35,
    "noise_residual": 0.35, "lighting": 0.15, "landmark_jitter": 0.5, "blink": 0.35, "rppg": 0.6,
    "av_sync": 0.5, "container": 0.4, "aasist": 1.0, "audio_spectral": 0.5, "prosody": 0.35,
    "breath_pause": 0.3, "splice": 0.3, "exif_metadata": 0.8, "c2pa": 1.0,
}

DEFAULT_THRESHOLDS = {"t_low": 0.30, "t_high": 0.70, "target_fpr": 0.05}


def default_fusion_config() -> dict[str, Any]:
    combos = {}
    for name, ids in COMBOS.items():
        combos[name] = {
            "features": ids,
            "weights": {i: DEFAULT_WEIGHTS[i] for i in ids},
            "mask_weights": {i: 0.0 for i in ids},
            "intercept": 0.0,
            "temperature_a": 1.0,
            "temperature_b": 0.0,
            "thresholds": dict(DEFAULT_THRESHOLDS),
        }
    return {
        "format": "pramaan-fusion-v1",
        "calibrated": False,
        "combos": combos,
        "indicator_calibrators": DEFAULT_CALIBRATORS,
        "x_clip": 8.0,
        "note": "Uncalibrated defaults — see docs/ALGORITHMS.md §Fusion defaults",
    }
