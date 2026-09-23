"""Splice / continuity discontinuities: spectral-centroid jumps and phase-advance deviation (§5.3.5)."""
from __future__ import annotations

import librosa
import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.audio.load import frame_rms_db, speech_mask
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult

N_FFT, HOP = 512, 160
Z_FLAG = 6.0


def _robust_z(x: np.ndarray, ref: np.ndarray) -> np.ndarray:
    med = np.median(ref)
    mad = 1.4826 * np.median(np.abs(ref - med)) + 1e-9
    return (x - med) / mad


def analyze_splice(y16k: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    sr = 16000
    if y16k.size < 2 * sr:
        return IndicatorResult.na("splice", "Audio shorter than 2 s")
    D = librosa.stft(y16k, n_fft=N_FFT, hop_length=HOP, center=False)
    mag, phase = np.abs(D), np.angle(D)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    centroid = (freqs[:, None] * mag).sum(0) / (mag.sum(0) + 1e-12)
    omega = 2 * np.pi * np.arange(mag.shape[0]) * HOP / N_FFT
    dphi = phase[:, 1:] - phase[:, :-1] - omega[:, None]
    dev = np.abs(np.angle(np.exp(1j * dphi)))
    w = mag[:, 1:] * mag[:, :-1]
    phase_dev = (dev * w).sum(0) / (w.sum(0) + 1e-12)
    cjump = np.abs(np.diff(centroid))

    _, db = frame_rms_db(y16k, sr, N_FFT / sr, HOP / sr)
    speech, _, _ = speech_mask(db)
    m = min(speech.size, cjump.size + 1)
    both = speech[1:m] & speech[: m - 1]  # interior transitions only: excludes speech onsets/offsets
    cjump, phase_dev = cjump[: m - 1], phase_dev[: m - 1]
    if both.sum() < 50:
        return IndicatorResult.na("splice", "Not enough continuous speech frames")
    zc = _robust_z(cjump, cjump[both])
    zp = _robust_z(phase_dev, phase_dev[both])
    z = np.where(both, np.maximum(zc, zp), 0.0)
    times = (np.arange(z.size) + 1) * HOP / sr + N_FFT / (2 * sr)
    flagged = np.nonzero(z > Z_FLAG)[0]
    events, last = [], -1e9
    for i in flagged:
        if times[i] - last > 0.25:
            events.append(round(float(times[i]), 3))
        last = times[i]
    plot = line_plot([(times, z, "robust z")], "Continuity discontinuity score", "time (s)", "z",
                     hlines=[(Z_FLAG, f"z = {Z_FLAG:.0f}")], vlines=events[:20])
    key = bag.add("splice_z", "Splice discontinuity timeline", "splice", plot)
    max_z = float(z.max())
    return IndicatorResult(
        id="splice", value=max_z, unit="robust z",
        features={"max_robust_z": max_z, "events_per_min": len(events) / (y16k.size / sr / 60)},
        details={"candidate_times_s": events[:30], "interior_frames": int(both.sum()), "z_threshold": Z_FLAG},
        artifact_key=key,
    )
