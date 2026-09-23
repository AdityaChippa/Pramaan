"""Breath & pause pattern (§5.3.4)."""
from __future__ import annotations

import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.audio.load import frame_rms_db, speech_mask
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult

HOP_S = 0.010


def _segments(mask: np.ndarray) -> list[tuple[int, int]]:
    segs, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            segs.append((start, i))
            start = None
    if start is not None:
        segs.append((start, len(mask)))
    return segs


def analyze_breath(y16k: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    sr = 16000
    t, db = frame_rms_db(y16k, sr, 0.025, HOP_S)
    if db.size < 300:
        return IndicatorResult.na("breath_pause", "Audio shorter than 3 s")
    speech, thr, floor = speech_mask(db)
    # Bridge short dips (< 150 ms) inside words.
    segs = _segments(~speech)
    for a, b in segs:
        if (b - a) * HOP_S < 0.15 and a > 0 and b < len(speech):
            speech[a:b] = True
    speech_s = float(speech.sum()) * HOP_S
    if speech_s < 3.0:
        return IndicatorResult.na("breath_pause", f"Needs ≥3 s of speech (got {speech_s:.1f} s)")
    n = 400
    hop = int(HOP_S * sr)
    pauses, breaths = [], []
    for a, b in _segments(~speech):
        if a == 0 or b == len(speech):
            continue  # leading/trailing silence is not an inter-phrase pause
        dur = (b - a) * HOP_S
        pauses.append(dur)
        # Inhalation: 150–800 ms sub-segment 6 dB above floor but below speech level, broadband (flat, high centroid).
        cand = (db[a:b] > floor + 6) & (db[a:b] <= thr)
        for ca, cb in _segments(cand):
            cdur = (cb - ca) * HOP_S
            if not 0.15 <= cdur <= 0.8:
                continue
            s0, s1 = (a + ca) * hop, min(y16k.size, (a + cb) * hop + n)
            seg = y16k[s0:s1]
            if seg.size < n:
                continue
            spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size))) ** 2
            freqs = np.fft.rfftfreq(seg.size, 1 / sr)
            centroid = float((freqs * spec).sum() / (spec.sum() + 1e-12))
            flatness = float(np.exp(np.mean(np.log(spec + 1e-12))) / (spec.mean() + 1e-12))
            if centroid > 1000 and flatness > 0.05:
                breaths.append((float(t[a + ca]), float(t[min(len(t) - 1, a + cb - 1)])))
    features = {"breaths_per_10s": len(breaths) / (speech_s / 10.0)}
    if len(pauses) >= 3:
        p = np.array(pauses)
        features["pause_cv"] = float(p.std() / p.mean())
    plot = line_plot([(t, db, "RMS dB")], "Energy envelope (breaths shaded)", "time (s)", "dB",
                     hlines=[(thr, "speech threshold"), (floor + 6, "floor + 6 dB")], vspans=breaths)
    key = bag.add("breath_energy", "Breath & pause energy map", "breath_pause", plot)
    return IndicatorResult(
        id="breath_pause", value=features["breaths_per_10s"], unit="breaths/10 s", features=features,
        details={"breaths": len(breaths), "pauses": len(pauses), "speech_seconds": round(speech_s, 2),
                 "mean_pause_s": round(float(np.mean(pauses)), 3) if pauses else None,
                 "breath_times": [[round(a, 2), round(b, 2)] for a, b in breaths[:30]]},
        artifact_key=key,
    )
