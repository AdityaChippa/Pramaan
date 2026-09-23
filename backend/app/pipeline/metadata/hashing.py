"""Ingestion hashes: SHA-256 (custody) and a 64-bit DCT perceptual hash (near-duplicate search)."""
from __future__ import annotations

import hashlib
from pathlib import Path

import cv2
import numpy as np


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def phash(img_bgr: np.ndarray) -> str:
    """pHash (Zauner 2010): 32×32 grayscale → DCT → top-left 8×8 (DC excluded from the median) → 64 bits."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    small = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    dct = cv2.dct(small)[:8, :8]
    flat = dct.flatten()
    med = float(np.median(flat[1:]))
    bits = flat > med
    value = 0
    for b in bits:
        value = (value << 1) | int(b)
    return f"{value:016x}"


def hamming(a: str, b: str) -> int:
    return int(bin(int(a, 16) ^ int(b, 16)).count("1"))
