"""Spectral artifacts: MFCC/LFCC statistics, flatness, >4 kHz energy, band-limiting cutoff (§5.3.2)."""
from __future__ import annotations

import librosa
import numpy as np
from scipy.fft import dct

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.audio.load import frame_rms_db, speech_mask
from app.pipeline.plots import spectrogram_image
from app.pipeline.types import IndicatorResult

CODEC_LOWPASS_HZ = 15500.0  # MP3/AAC encoders commonly low-pass ≥ 15.5 kHz


def lfcc(power: np.ndarray, sr: int, n_filters: int = 40, n_ceps: int = 20) -> np.ndarray:
    n_fft_bins = power.shape[0]
    freqs = np.linspace(0, sr / 2, n_fft_bins)
    edges = np.linspace(0, sr / 2, n_filters + 2)
    fb = np.zeros((n_filters, n_fft_bins))
    for i in range(n_filters):
        lo, c, hi = edges[i], edges[i + 1], edges[i + 2]
        fb[i] = np.clip(np.minimum((freqs - lo) / (c - lo + 1e-9), (hi - freqs) / (hi - c + 1e-9)), 0, None)
    return dct(np.log(fb @ power + 1e-10), axis=0, norm="ortho")[:n_ceps]


def analyze_spectral(native: np.ndarray, sr: int, y16k: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    if y16k.size < 16000:
        return IndicatorResult.na("audio_spectral", "Audio shorter than 1 s")
    n_fft = 1024 if sr >= 22050 else 512
    hop = n_fft // 4
    S = np.abs(librosa.stft(native.astype(np.float32), n_fft=n_fft, hop_length=hop)) ** 2
    _, db = frame_rms_db(native, sr, n_fft / sr, hop / sr)
    mask, _, _ = speech_mask(db)
    ncols = min(S.shape[1], mask.size)
    speech_cols = np.nonzero(mask[:ncols])[0] if ncols else np.array([], int)
    if speech_cols.size < 10:
        return IndicatorResult.na("audio_spectral", "Not enough voiced/active frames")
    Ss = S[:, speech_cols]
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    ltas = 10 * np.log10(Ss.mean(axis=1) + 1e-12)

    # Band-limiting cliff: largest drop between adjacent 300 Hz bands above 3 kHz.
    bw = max(1, int(300 / (freqs[1] - freqs[0])))
    best_drop, cutoff = 0.0, None
    for i in range(np.searchsorted(freqs, 3000.0), len(freqs) - bw):
        if i - bw < 0 or freqs[i] > 0.97 * sr / 2:
            break
        drop = float(ltas[i - bw:i].mean() - ltas[i:i + bw].mean())
        if drop > best_drop:
            best_drop, cutoff = drop, float(freqs[i])
    codec_like = bool(cutoff is not None and cutoff >= CODEC_LOWPASS_HZ)
    band_limit = float(np.clip(best_drop / 40.0, 0, 1)) * (0.5 if codec_like else 1.0)

    flat = librosa.feature.spectral_flatness(S=np.sqrt(Ss))[0]
    total = Ss.sum()
    hf_ratio = float(Ss[freqs > 4000].sum() / total) if sr > 8000 and total > 0 else 0.0
    mf = librosa.feature.mfcc(y=y16k, sr=16000, n_mfcc=20)
    mf_delta = librosa.feature.delta(mf)
    P16 = np.abs(librosa.stft(y16k, n_fft=512, hop_length=160)) ** 2
    lf = lfcc(P16, 16000)
    features = {"band_limit_score": band_limit, "flatness_mean": float(flat.mean()), "hf_energy_ratio": hf_ratio,
                "mfcc_delta_std": float(mf_delta.std()), "lfcc_hf_std": float(lf[10:].std(axis=1).mean())}

    spec_db = 10 * np.log10(S[:, :4000] + 1e-12)
    img = spectrogram_image(spec_db, sr, hop / sr, marks_hz=[cutoff] if cutoff and best_drop >= 12 else [],
                            bands_hz=[(cutoff, sr / 2)] if cutoff and best_drop >= 12 else [])
    key = bag.add("audio_spectrogram", "Spectrogram (suspicious band shaded)", "audio_spectral", img)
    return IndicatorResult(
        id="audio_spectral", value=band_limit, unit="band-limit", features=features,
        details={"native_sample_rate": sr, "cutoff_hz": None if cutoff is None else round(cutoff, 1),
                 "cutoff_drop_db": round(best_drop, 2), "codec_like_lowpass": codec_like,
                 "flatness_p90": round(float(np.percentile(flat, 90)), 4), "speech_frames": int(speech_cols.size)},
        artifact_key=key,
    )
