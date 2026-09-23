"""Frequency-domain spectrum features (§5.1.3)."""
from __future__ import annotations

import cv2
import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult

BLOCK = 256
NATURAL_SLOPE = -2.0  # 1/f² power law of natural images (van der Schaaf & van Hateren 1996)


def welch_spectrum_2d(gray: np.ndarray, block: int = BLOCK) -> np.ndarray:
    """Averaged, Hann-windowed periodogram of 50%-overlapping blocks (reduces periodogram variance)."""
    h, w = gray.shape
    if min(h, w) < block:
        s = block / min(h, w)
        gray = cv2.resize(gray, (int(np.ceil(w * s)), int(np.ceil(h * s))), interpolation=cv2.INTER_CUBIC)
        h, w = gray.shape
    win = np.outer(np.hanning(block), np.hanning(block)).astype(np.float32)
    acc = np.zeros((block, block), np.float64)
    n = 0
    step = block // 2
    for y in range(0, h - block + 1, step):
        for x in range(0, w - block + 1, step):
            b = gray[y:y + block, x:x + block]
            b = (b - b.mean()) * win
            acc += np.abs(np.fft.fftshift(np.fft.fft2(b))) ** 2
            n += 1
            if n >= 64:
                break
        if n >= 64:
            break
    return acc / max(n, 1)


def radial_profile(p2: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = p2.shape[0]
    c = n // 2
    yy, xx = np.indices(p2.shape)
    r = np.hypot(yy - c, xx - c).astype(np.int32)
    rmax = c
    sums = np.bincount(r.ravel(), p2.ravel(), minlength=rmax + 1)[: rmax + 1]
    cnts = np.bincount(r.ravel(), minlength=rmax + 1)[: rmax + 1]
    prof = sums / np.maximum(cnts, 1)
    freqs = np.arange(rmax + 1) / n  # cycles per pixel
    return freqs[1:], prof[1:]


def analyze_frequency(img_bgr: np.ndarray, bag: ArtifactBag) -> IndicatorResult:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape
    s = 1024 / max(h, w)
    if s < 1:
        gray = cv2.resize(gray, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    p2 = welch_spectrum_2d(gray)
    freqs, prof = radial_profile(p2)
    fmax = freqs[-1]
    hf_ratio = float(prof[freqs > 0.5 * fmax].sum() / (prof.sum() + 1e-12))
    band = (freqs >= 0.1 * fmax) & (freqs <= 0.9 * fmax)
    lx, ly = np.log10(freqs[band]), np.log10(prof[band] + 1e-12)
    slope, intercept = np.polyfit(lx, ly, 1)

    # Periodic peak strength at GAN-upsampling (checkerboard) frequencies: ±N/4 and ±N/2 on axes and diagonals.
    n = p2.shape[0]
    c = n // 2
    logp = np.log(p2 + 1e-12)
    yy, xx = np.indices(p2.shape)
    r = np.hypot(yy - c, xx - c).astype(np.int32)
    med_r = np.zeros(c + 2)
    mad_r = np.ones(c + 2)
    for rad in range(1, c + 1):
        vals = logp[r == rad]
        if vals.size:
            med_r[rad] = np.median(vals)
            mad_r[rad] = 1.4826 * np.median(np.abs(vals - med_r[rad])) + 1e-6
    zmap = np.zeros_like(logp)
    ok = (r >= 1) & (r <= c)
    zmap[ok] = (logp[ok] - med_r[r[ok]]) / mad_r[r[ok]]
    candidates = []
    for du in (-n // 2, -n // 4, 0, n // 4, n // 2 - 1):
        for dv in (-n // 2, -n // 4, 0, n // 4, n // 2 - 1):
            if du == 0 and dv == 0:
                continue
            y, x = c + dv, c + du
            y0, y1, x0, x1 = max(0, y - 1), min(n, y + 2), max(0, x - 1), min(n, x + 2)
            candidates.append(float(zmap[y0:y1, x0:x1].max()))
    peak_strength = float(np.mean(sorted(candidates, reverse=True)[:4]))

    fit = intercept + slope * np.log10(freqs)
    plot = line_plot(
        [(np.log10(freqs), np.log10(prof + 1e-12), "log10 power"), (np.log10(freqs), fit, f"fit slope {slope:.2f}")],
        "Azimuthally averaged power spectrum", "log10 frequency (cycles/px)", "log10 P",
    )
    key = bag.add("freq_spectrum", "Radial power spectrum", "freq_spectrum", plot)
    idx = np.unique(np.linspace(0, len(freqs) - 1, min(128, len(freqs))).astype(int))
    bag.series["spectrum"] = {"freq": np.round(freqs[idx], 5).tolist(), "power": np.round(np.log10(prof[idx] + 1e-12), 4).tolist()}
    return IndicatorResult(
        id="freq_spectrum",
        value=float(slope),
        unit="slope",
        features={"hf_ratio": hf_ratio, "spectral_slope": float(slope), "slope_deviation": float(abs(slope - NATURAL_SLOPE)),
                  "peak_strength": peak_strength},
        details={"peak_candidates_z": [round(v, 3) for v in candidates], "blocks_averaged": int(min(64, ((gray.shape[0] - BLOCK) // (BLOCK // 2) + 1) * ((gray.shape[1] - BLOCK) // (BLOCK // 2) + 1))) if min(gray.shape) >= BLOCK else 1,
                 "limitation": "JPEG 8×8 blocking also produces peaks at multiples of 1/8 cycles/px"},
        artifact_key=key,
    )
