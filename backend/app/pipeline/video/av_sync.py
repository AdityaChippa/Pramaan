"""Audio–visual synchronisation: mouth aperture vs. audio RMS envelope (§5.2.5)."""
from __future__ import annotations

import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult
from app.pipeline.video.face_timeline import FaceTrack

MAX_LAG_MS = 500.0


def analyze_av_sync(track: FaceTrack, audio: np.ndarray | None, sr: int, bag: ArtifactBag) -> IndicatorResult:
    if audio is None or audio.size == 0:
        return IndicatorResult.na("av_sync", "Not analyzed — no audio track")
    t = np.asarray(track.t)
    mouth = np.asarray(track.mouth, float)
    ok = np.isfinite(mouth)
    if ok.sum() < 3 * track.fps:
        return IndicatorResult.na("av_sync", "Needs ≥3 s of tracked mouth landmarks")
    mouth_i = np.interp(t, t[ok], mouth[ok])
    hop = int(round(sr / track.fps))
    env = np.array([np.sqrt(np.mean(audio[int(round(ti * sr)):int(round(ti * sr)) + hop] ** 2)) if int(round(ti * sr)) + hop <= audio.size else np.nan for ti in t])
    good = np.isfinite(env)
    if good.sum() < 3 * track.fps or np.nanmax(env) < 1e-4:
        return IndicatorResult.na("av_sync", "Audio track is silent or shorter than 3 s of video")
    m = mouth_i[good]
    e = env[good]
    m = (m - m.mean()) / (m.std() + 1e-9)
    e = (e - e.mean()) / (e.std() + 1e-9)
    max_lag = int(round(MAX_LAG_MS / 1000 * track.fps))
    lags, corrs = [], []
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            a, b = m[lag:], e[: len(e) - lag]
        else:
            a, b = m[: len(m) + lag], e[-lag:]
        if len(a) < 2 * track.fps:
            continue
        lags.append(lag / track.fps * 1000)
        corrs.append(float(np.corrcoef(a, b)[0, 1]))
    if not corrs:
        return IndicatorResult.na("av_sync", "Overlap too short for lag search")
    k = int(np.nanargmax(corrs))
    bag.series["av_sync"] = {"lags_ms": [round(v, 1) for v in lags], "corr": [round(v, 4) for v in corrs]}
    plot = line_plot([(lags, corrs, "normalized xcorr")], "Mouth aperture ↔ audio envelope", "lag (ms, + = video lags audio)", "r",
                     vlines=[lags[k]])
    key = bag.add("av_sync", "AV-sync cross-correlation", "av_sync", plot)
    return IndicatorResult(
        id="av_sync", value=corrs[k], unit="max corr",
        features={"max_corr": corrs[k], "abs_lag_ms": abs(lags[k]), "zero_lag_corr": corrs[len(corrs) // 2]},
        details={"lag_ms": round(lags[k], 1), "analysis_fps": round(track.fps, 2), "samples": int(good.sum())},
        artifact_key=key,
    )
