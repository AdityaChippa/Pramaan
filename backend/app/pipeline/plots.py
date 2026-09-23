"""Dependency-free (OpenCV) chart and heatmap rendering for evidence artifacts."""
from __future__ import annotations

from typing import Sequence

import cv2
import numpy as np

BG = (12, 12, 12)
FG = (234, 226, 215)
GRID = (40, 40, 40)
PALETTE = [(94, 77, 255), (151, 220, 61), (37, 165, 245), (168, 0, 182), (0, 76, 190)]  # BGR


def overlay_heatmap(img_bgr: np.ndarray, heat01: np.ndarray, alpha: float = 0.45) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    heat = cv2.resize(np.clip(heat01, 0, 1).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    colored = cv2.applyColorMap((heat * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    return cv2.addWeighted(img_bgr, 1 - alpha, colored, alpha, 0)


def normalize01(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.float32)
    lo, hi = float(np.nanmin(a)), float(np.nanmax(a))
    if not np.isfinite(lo) or not np.isfinite(hi) or hi - lo < 1e-12:
        return np.zeros_like(a)
    return (a - lo) / (hi - lo)


def line_plot(
    series: Sequence[tuple[Sequence[float], Sequence[float], str]],
    title: str,
    xlabel: str,
    ylabel: str,
    width: int = 960,
    height: int = 340,
    hlines: Sequence[tuple[float, str]] = (),
    vspans: Sequence[tuple[float, float]] = (),
    vlines: Sequence[float] = (),
) -> np.ndarray:
    img = np.full((height, width, 3), BG, np.uint8)
    ml, mr, mt, mb = 70, 20, 40, 45
    pw, ph = width - ml - mr, height - mt - mb
    xs_all = np.concatenate([np.asarray(s[0], float) for s in series if len(s[0])]) if series else np.array([0.0, 1.0])
    ys_all = np.concatenate([np.asarray(s[1], float) for s in series if len(s[1])]) if series else np.array([0.0, 1.0])
    ys_all = ys_all[np.isfinite(ys_all)] if ys_all.size else np.array([0.0, 1.0])
    if ys_all.size == 0:
        ys_all = np.array([0.0, 1.0])
    x0, x1 = float(np.min(xs_all)), float(np.max(xs_all))
    y0, y1 = float(np.min(ys_all)), float(np.max(ys_all))
    for v, _ in hlines:
        y0, y1 = min(y0, v), max(y1, v)
    if x1 - x0 < 1e-9:
        x1 = x0 + 1
    if y1 - y0 < 1e-9:
        y1 = y0 + 1
    pad = (y1 - y0) * 0.08
    y0, y1 = y0 - pad, y1 + pad

    def px(x: float) -> int:
        return int(ml + (x - x0) / (x1 - x0) * pw)

    def py(y: float) -> int:
        return int(mt + ph - (y - y0) / (y1 - y0) * ph)

    for a, b in vspans:
        cv2.rectangle(img, (px(a), mt), (max(px(a) + 1, px(b)), mt + ph), (40, 30, 70), -1)
    for i in range(5):
        gy = mt + int(ph * i / 4)
        cv2.line(img, (ml, gy), (ml + pw, gy), GRID, 1)
        val = y1 - (y1 - y0) * i / 4
        cv2.putText(img, f"{val:.3g}", (6, gy + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, FG, 1, cv2.LINE_AA)
    for i in range(6):
        gx = ml + int(pw * i / 5)
        val = x0 + (x1 - x0) * i / 5
        cv2.putText(img, f"{val:.3g}", (gx - 12, mt + ph + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.38, FG, 1, cv2.LINE_AA)
    for v, label in hlines:
        cv2.line(img, (ml, py(v)), (ml + pw, py(v)), (120, 120, 120), 1, cv2.LINE_AA)
        cv2.putText(img, label, (ml + pw - 140, py(v) - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 180), 1, cv2.LINE_AA)
    for v in vlines:
        cv2.line(img, (px(v), mt), (px(v), mt + ph), (94, 77, 255), 1, cv2.LINE_AA)
    for k, (xs, ys, label) in enumerate(series):
        xs_a, ys_a = np.asarray(xs, float), np.asarray(ys, float)
        ok = np.isfinite(xs_a) & np.isfinite(ys_a)
        pts = np.array([[px(x), py(y)] for x, y in zip(xs_a[ok], ys_a[ok])], np.int32)
        color = PALETTE[k % len(PALETTE)]
        if len(pts) > 1:
            cv2.polylines(img, [pts], False, color, 2, cv2.LINE_AA)
        elif len(pts) == 1:
            cv2.circle(img, tuple(pts[0]), 3, color, -1)
        cv2.putText(img, label, (ml + 8 + 170 * k, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
    cv2.putText(img, title, (ml, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, FG, 1, cv2.LINE_AA)
    cv2.putText(img, xlabel, (ml + pw // 2 - 30, height - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, FG, 1, cv2.LINE_AA)
    cv2.putText(img, ylabel, (6, mt - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, FG, 1, cv2.LINE_AA)
    return img


def spectrogram_image(spec_db: np.ndarray, sr: int, hop_s: float, marks_hz: Sequence[float] = (), bands_hz: Sequence[tuple[float, float]] = ()) -> np.ndarray:
    """spec_db: (freq_bins, frames), low frequency at row 0."""
    s = normalize01(np.flipud(spec_db))
    img = cv2.applyColorMap((s * 255).astype(np.uint8), cv2.COLORMAP_MAGMA)
    img = cv2.resize(img, (960, 360), interpolation=cv2.INTER_LINEAR)
    nyq = sr / 2
    for lo, hi in bands_hz:
        y_hi, y_lo = int(360 * (1 - hi / nyq)), int(360 * (1 - lo / nyq))
        overlay = img.copy()
        cv2.rectangle(overlay, (0, max(0, y_hi)), (959, min(359, y_lo)), (94, 77, 255), -1)
        img = cv2.addWeighted(img, 0.7, overlay, 0.3, 0)
    for f in marks_hz:
        y = int(360 * (1 - f / nyq))
        cv2.line(img, (0, y), (959, y), (94, 77, 255), 2, cv2.LINE_AA)
        cv2.putText(img, f"{f:.0f} Hz", (8, max(14, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def waveform_image(y: np.ndarray, width: int = 640, height: int = 400) -> np.ndarray:
    img = np.full((height, width, 3), BG, np.uint8)
    if y.size == 0:
        return img
    cols = np.array_split(np.abs(y), width)
    mid = height // 2
    peak = max(1e-6, float(np.max(np.abs(y))))
    for x, c in enumerate(cols):
        a = float(np.max(c)) / peak if c.size else 0.0
        h = int(a * (height * 0.42))
        cv2.line(img, (x, mid - h), (x, mid + h), (215, 170, 182), 1)
    return img
