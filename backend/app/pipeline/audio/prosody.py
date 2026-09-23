"""Prosody via Praat (parselmouth): F0 variability, jitter, shimmer, HNR (§5.3.3)."""
from __future__ import annotations

import numpy as np
import parselmouth
from parselmouth.praat import call

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult

F0_MIN, F0_MAX = 75.0, 500.0


def analyze_prosody(y16k: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    if y16k.size < 16000:
        return IndicatorResult.na("prosody", "Audio shorter than 1 s")
    snd = parselmouth.Sound(y16k.astype(np.float64), sampling_frequency=16000)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=F0_MIN, pitch_ceiling=F0_MAX)
    f0 = pitch.selected_array["frequency"]
    times = pitch.xs()
    voiced = f0 > 0
    if voiced.sum() < 50:
        return IndicatorResult.na("prosody", "Fewer than 0.5 s of voiced speech")
    fv = f0[voiced]
    f0_cv = float(fv.std() / fv.mean())
    pp = call(snd, "To PointProcess (periodic, cc)", F0_MIN, F0_MAX)
    jitter = float(call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3))
    shimmer = float(call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    harm = call(snd, "To Harmonicity (cc)", 0.01, F0_MIN, 0.1, 1.0)
    hnr = float(call(harm, "Get mean", 0, 0))
    features = {"f0_cv": f0_cv}
    for name, v in (("jitter_local", jitter), ("shimmer_local", shimmer), ("hnr_db", hnr)):
        if np.isfinite(v):
            features[name] = v
    semitones = 12 * np.log2(fv / np.median(fv))
    features["f0_semitone_std"] = float(semitones.std())
    contour = np.where(voiced, f0, np.nan)
    plot = line_plot([(times, contour, "F0 (Hz)")], "Pitch contour", "time (s)", "Hz")
    key = bag.add("prosody_pitch", "Pitch contour", "prosody", plot)
    return IndicatorResult(
        id="prosody", value=f0_cv, unit="F0 CV", features=features,
        details={"f0_mean_hz": round(float(fv.mean()), 2), "f0_median_hz": round(float(np.median(fv)), 2),
                 "voiced_seconds": round(float(voiced.sum()) * 0.01, 2),
                 "jitter_local_pct": round(jitter * 100, 3) if np.isfinite(jitter) else None,
                 "shimmer_local_pct": round(shimmer * 100, 3) if np.isfinite(shimmer) else None,
                 "hnr_db": round(hnr, 2) if np.isfinite(hnr) else None},
        artifact_key=key,
    )
