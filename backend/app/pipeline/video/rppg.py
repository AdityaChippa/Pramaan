"""rPPG biological signal, FakeCatcher-inspired (§5.2.4). POS projection per ROI (Wang et al. 2017)."""
from __future__ import annotations

import numpy as np
from scipy import signal

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult
from app.pipeline.video.face_timeline import FaceTrack

BAND = (0.7, 4.0)


def _interp_rgb(t: np.ndarray, rgb: np.ndarray) -> np.ndarray | None:
    ok = np.isfinite(rgb).all(axis=1)
    if ok.sum() < 0.8 * len(t):
        return None
    return np.column_stack([np.interp(t, t[ok], rgb[ok, c]) for c in range(3)])


def pos_signal(rgb: np.ndarray, fps: float) -> np.ndarray:
    n = len(rgb)
    win = max(int(round(1.6 * fps)), 4)
    h = np.zeros(n)
    proj = np.array([[0.0, 1.0, -1.0], [-2.0, 1.0, 1.0]])
    for start in range(0, n - win + 1):
        c = rgb[start:start + win]
        mean = c.mean(axis=0)
        if np.any(mean <= 1e-6):
            continue
        s = proj @ (c / mean).T
        std2 = s[1].std()
        p = s[0] + (s[0].std() / std2 if std2 > 1e-9 else 0.0) * s[1]
        h[start:start + win] += p - p.mean()
    return h


def bandpass(x: np.ndarray, fps: float) -> np.ndarray:
    nyq = fps / 2
    hi = min(BAND[1], nyq * 0.95)
    b, a = signal.butter(3, [BAND[0] / nyq, hi / nyq], btype="band")
    return signal.filtfilt(b, a, signal.detrend(x), padlen=min(len(x) - 1, 3 * max(len(a), len(b))))


def snr_db(freqs: np.ndarray, psd: np.ndarray, f0: float) -> float:
    band = (freqs >= BAND[0]) & (freqs <= BAND[1])
    sig_mask = band & ((np.abs(freqs - f0) <= 0.1) | (np.abs(freqs - 2 * f0) <= 0.2))
    noise = psd[band & ~sig_mask].sum()
    return float(10 * np.log10(psd[sig_mask].sum() / noise)) if noise > 0 and psd[sig_mask].sum() > 0 else float("nan")


def analyze_rppg(track: FaceTrack, bag: ArtifactBag, min_seconds: float = 5.0) -> IndicatorResult:
    if track.face_seconds < min_seconds or track.fps < 2 * BAND[1] * 1.05:
        return IndicatorResult.na("rppg", f"Needs ≥{min_seconds:.0f} s of face video at ≥8.4 fps (got {track.face_seconds:.1f} s at {track.fps:.1f} fps)")
    t = np.asarray(track.t)
    rois = {}
    for name in ("forehead", "left_cheek", "right_cheek"):
        rgb = _interp_rgb(t, np.asarray(getattr(track, name), float))
        if rgb is None:
            return IndicatorResult.na("rppg", f"{name.replace('_', ' ')} ROI not visible in ≥80% of frames")
        rois[name] = bandpass(pos_signal(rgb, track.fps), track.fps)
    fps = track.fps
    nper = min(len(t), int(fps * 8))
    mean_sig = np.mean([s / (s.std() + 1e-9) for s in rois.values()], axis=0)
    freqs, psd = signal.welch(mean_sig, fs=fps, nperseg=nper)
    band = (freqs >= BAND[0]) & (freqs <= BAND[1])
    if not band.any():
        return IndicatorResult.na("rppg", "Frequency resolution too coarse for the pulse band")
    f0 = float(freqs[band][np.argmax(psd[band])])
    snr = snr_db(freqs, psd, f0)
    names = list(rois)
    coh_vals, corr_vals = [], []
    for i in range(3):
        for j in range(i + 1, 3):
            fc, cxy = signal.coherence(rois[names[i]], rois[names[j]], fs=fps, nperseg=min(len(t), int(fps * 4)))
            near = (fc >= max(BAND[0], f0 - 0.2)) & (fc <= min(BAND[1], f0 + 0.2))
            coh_vals.append(float(cxy[near].max()) if near.any() else float(cxy[(fc >= BAND[0]) & (fc <= BAND[1])].mean()))
            corr_vals.append(float(np.corrcoef(rois[names[i]], rois[names[j]])[0, 1]))
    coherence = float(np.mean(coh_vals))
    step = max(1, len(t) // 600)
    bag.series["rppg"] = {"t": np.round(t[::step], 3).tolist(),
                          **{k: np.round(v[::step] / (v.std() + 1e-9), 4).tolist() for k, v in rois.items()},
                          "freqs": np.round(freqs[band], 4).tolist(), "power": np.round(psd[band], 6).tolist()}
    sig_plot = line_plot([(t, rois[k] / (rois[k].std() + 1e-9), k) for k in names], "rPPG (POS, 0.7–4 Hz)", "time (s)", "z")
    spec_plot = line_plot([(freqs[band] * 60, psd[band], "PSD")], f"Pulse spectrum — peak {f0 * 60:.0f} bpm", "bpm", "power",
                          vlines=[f0 * 60])
    key = bag.add("rppg", "rPPG signals and spectrum", "rppg", np.vstack([sig_plot, spec_plot]))
    features = {"coherence": coherence, "mean_corr": float(np.mean(corr_vals))}
    if np.isfinite(snr):
        features["snr_db"] = snr
    return IndicatorResult(
        id="rppg", value=coherence, unit="coherence", features=features,
        details={"pulse_hz": round(f0, 3), "pulse_bpm": round(f0 * 60, 1), "snr_db": None if not np.isfinite(snr) else round(snr, 2),
                 "pairwise_coherence": dict(zip(["forehead–left", "forehead–right", "left–right"], [round(v, 4) for v in coh_vals])),
                 "pairwise_corr": [round(v, 4) for v in corr_vals], "analysis_fps": round(fps, 2),
                 "seconds": round(float(t[-1] - t[0]), 2)},
        artifact_key=key,
    )
