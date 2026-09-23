"""Audio loading (16 kHz mono for models, native rate for band-limit analysis) and framing helpers."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.pipeline.media import decode_audio

TARGET_SR = 16000


@dataclass
class AudioData:
    y16k: np.ndarray
    native: np.ndarray
    native_sr: int
    duration_s: float


def load_audio(path: str | Path, max_seconds: float) -> AudioData:
    y16, _ = decode_audio(path, TARGET_SR, max_seconds)
    native, nsr = decode_audio(path, None, max_seconds)
    if y16.size == 0:
        raise ValueError("audio stream decoded to zero samples")
    return AudioData(y16k=y16, native=native, native_sr=nsr, duration_s=y16.size / TARGET_SR)


def frame_rms_db(y: np.ndarray, sr: int, frame_s: float = 0.025, hop_s: float = 0.010) -> tuple[np.ndarray, np.ndarray]:
    n, h = int(frame_s * sr), int(hop_s * sr)
    if y.size < n:
        return np.array([]), np.array([])
    idx = np.arange(0, y.size - n + 1, h)
    frames = np.lib.stride_tricks.sliding_window_view(y, n)[idx]
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1))
    return (idx + n / 2) / sr, 20 * np.log10(rms + 1e-10)


def speech_mask(db: np.ndarray, dynamic_db: float = 35.0) -> tuple[np.ndarray, float, float]:
    """Energy VAD: speech if within `dynamic_db` of the 99th-percentile level and ≥10 dB above the floor."""
    if db.size == 0:
        return np.zeros(0, bool), 0.0, 0.0
    peak = float(np.percentile(db, 99))
    floor = float(np.percentile(db, 5))
    thr = max(peak - dynamic_db, floor + 10.0)
    return db > thr, thr, floor
