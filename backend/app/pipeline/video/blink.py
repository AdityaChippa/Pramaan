"""Blink analysis from the Eye Aspect Ratio series (§5.2.3)."""
from __future__ import annotations

import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult
from app.pipeline.video.face_timeline import FaceTrack

RATE_RANGE = (8.0, 21.0)  # blinks/min at rest, conversational (Bentivoglio et al. 1997)
DURATION_RANGE_MS = (100.0, 400.0)  # (Schiffman 2001; Caffier et al. 2003)


def analyze_blink(track: FaceTrack, bag: ArtifactBag, min_face_seconds: float = 5.0) -> IndicatorResult:
    if track.face_seconds < min_face_seconds:
        return IndicatorResult.na("blink", f"Needs ≥{min_face_seconds:.0f} s of tracked face (got {track.face_seconds:.1f} s)")
    t = np.asarray(track.t)
    ear = np.asarray(track.ear, float)
    valid = np.isfinite(ear)
    if valid.sum() < 10:
        return IndicatorResult.na("blink", "Eye landmarks not measurable")
    ear_i = np.interp(t, t[valid], ear[valid])
    k = 3
    smooth = np.convolve(ear_i, np.ones(k) / k, mode="same")
    open_level = float(np.percentile(smooth[valid], 90))
    thresh = 0.75 * open_level
    below = (smooth < thresh) & valid
    blinks = []
    i = 0
    dt = 1.0 / track.fps
    while i < len(below):
        if below[i]:
            j = i
            while j < len(below) and below[j]:
                j += 1
            dur_ms = (j - i) * dt * 1000
            if dur_ms <= 800:
                depth = (open_level - float(ear_i[i:j].min())) / max(open_level, 1e-6)
                blinks.append({"t_start": float(t[i]), "t_end": float(t[j - 1] + dt), "duration_ms": dur_ms, "depth": depth})
            i = j
        else:
            i += 1
    minutes = track.face_seconds / 60.0
    rate = len(blinks) / minutes
    lo, hi = RATE_RANGE
    rate_dev = (lo - rate) / lo if rate < lo else (rate - hi) / hi if rate > hi else 0.0
    features = {"rate_per_min": rate, "rate_deviation": float(rate_dev)}
    if blinks:
        durs = np.array([b["duration_ms"] for b in blinks])
        features["duration_deviation"] = float(((durs < DURATION_RANGE_MS[0]) | (durs > DURATION_RANGE_MS[1])).mean())
        # A full closure drops EAR by roughly 60–70 % of the open level (Soukupová & Čech 2016).
        depth = np.array([b["depth"] for b in blinks])
        features["incompleteness"] = float(np.clip(1 - depth.mean() / 0.6, 0, 1))
    bag.series["ear"] = [{"t": round(float(a), 3), "ear": round(float(b), 4)} for a, b in zip(t, ear_i)]
    bag.series["blinks"] = [{"t_start": round(b["t_start"], 3), "t_end": round(b["t_end"], 3)} for b in blinks]
    plot = line_plot([(t, ear_i, "EAR")], "Eye aspect ratio", "time (s)", "EAR",
                     hlines=[(thresh, "blink threshold")], vspans=[(b["t_start"], b["t_end"]) for b in blinks])
    key = bag.add("blink_ear", "Eye aspect ratio curve", "blink", plot)
    return IndicatorResult(
        id="blink", value=rate, unit="blinks/min", features=features,
        details={"blinks": len(blinks), "face_seconds": round(track.face_seconds, 2), "open_level": round(open_level, 4),
                 "threshold": round(thresh, 4), "analysis_fps": round(track.fps, 2),
                 "mean_duration_ms": round(float(np.mean([b["duration_ms"] for b in blinks])), 1) if blinks else None,
                 "limitation": "Blinks shorter than one analysis frame can be missed"},
        artifact_key=key,
    )
