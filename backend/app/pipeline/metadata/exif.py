"""EXIF / XMP / PNG-text metadata forensics for still images."""
from __future__ import annotations

import datetime as dt
import io
import re
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from app.pipeline.types import IndicatorResult

GENERATOR_PATTERNS = [
    r"stable[\s_-]?diffusion", r"comfyui", r"automatic1111", r"\bsampler:\s", r"\bcfg scale:\s", r"negative prompt:",
    r"midjourney", r"dall[\s·-]?e", r"novelai", r"invokeai", r"fooocus", r"adobe firefly", r"imagen",
    r"trainedalgorithmicmedia", r"flux\.1", r"leonardo\.ai", r"ideogram",
]
EDITOR_PATTERNS = [
    r"photoshop", r"\bgimp\b", r"lightroom", r"snapseed", r"picsart", r"\bcanva\b", r"affinity photo",
    r"pixelmator", r"faceapp", r"facetune", r"remini", r"photopea", r"luminar", r"capture one", r"paint\.net",
]
GENERATOR_PNG_KEYS = {"parameters", "prompt", "workflow", "sd-metadata", "invokeai_metadata", "dream", "novelai"}
EXIF_TAGS = {0x010F: "Make", 0x0110: "Model", 0x0131: "Software", 0x0132: "DateTime", 0x013B: "Artist"}
EXIF_IFD_TAGS = {0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized", 0xA434: "LensModel"}


def _parse_exif_time(s: Any) -> dt.datetime | None:
    if not isinstance(s, str):
        return None
    try:
        return dt.datetime.strptime(s.strip()[:19], "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def _read_exif(img: Image.Image) -> dict[str, Any]:
    out: dict[str, Any] = {}
    exif = img.getexif()
    for tag, name in EXIF_TAGS.items():
        if tag in exif:
            out[name] = str(exif.get(tag)).strip("\x00 ")
    try:
        ifd = exif.get_ifd(0x8769)
        for tag, name in EXIF_IFD_TAGS.items():
            if tag in ifd:
                out[name] = str(ifd.get(tag)).strip("\x00 ")
    except Exception:  # noqa: BLE001 — malformed IFDs are common and not themselves evidence
        pass
    return out


def _thumbnail_check(raw: bytes, main_bgr: np.ndarray) -> dict[str, Any] | None:
    """Compares the EXIF-embedded JPEG thumbnail with the downscaled main image (Kee, Johnson & Farid 2011)."""
    try:
        import piexif

        thumb_bytes = piexif.load(raw).get("thumbnail")
    except Exception:  # noqa: BLE001
        return None
    if not thumb_bytes:
        return None
    arr = cv2.imdecode(np.frombuffer(thumb_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    if arr is None or arr.size == 0:
        return None
    th, tw = arr.shape
    mh, mw = main_bgr.shape[:2]
    aspect_diff = abs((tw / th) - (mw / mh)) / (mw / mh)
    aspect_diff_rot = abs((tw / th) - (mh / mw)) / (mh / mw)
    gray = cv2.cvtColor(main_bgr, cv2.COLOR_BGR2GRAY)
    if aspect_diff_rot < aspect_diff:
        gray = cv2.rotate(gray, cv2.ROTATE_90_CLOCKWISE)
        aspect_diff = aspect_diff_rot
    small = cv2.resize(gray, (tw, th), interpolation=cv2.INTER_AREA).astype(np.float32)
    a = arr.astype(np.float32)
    a = (a - a.mean()) / (a.std() + 1e-6)
    s = (small - small.mean()) / (small.std() + 1e-6)
    corr = float((a * s).mean())
    return {"thumb_size": [tw, th], "aspect_diff": round(aspect_diff, 4), "correlation": round(corr, 4),
            "mismatch": bool(aspect_diff > 0.05 or corr < 0.8)}


def analyze_image_metadata(path: str | Path, img_bgr: np.ndarray) -> IndicatorResult:
    raw = Path(path).read_bytes()
    with Image.open(io.BytesIO(raw)) as im:
        fmt = im.format or ""
        exif = _read_exif(im)
        png_text = {str(k): str(v)[:2000] for k, v in (im.info or {}).items() if isinstance(v, (str, bytes)) and k not in ("icc_profile", "exif")}
    xmp_match = re.search(rb"<x:xmpmeta.*?</x:xmpmeta>", raw, re.S)
    xmp = xmp_match.group(0).decode("utf-8", errors="ignore")[:20000] if xmp_match else ""

    haystack = " ".join([" ".join(f"{k}={v}" for k, v in exif.items()), xmp,
                         " ".join(f"{k}={v}" for k, v in png_text.items())]).lower()
    generator_hits = sorted({p for p in GENERATOR_PATTERNS if re.search(p, haystack)})
    generator_keys = sorted(k for k in png_text if k.lower() in GENERATOR_PNG_KEYS)
    editor_hits = sorted({p for p in EDITOR_PATTERNS if re.search(p, haystack)})

    camera_present = bool(exif.get("Make") or exif.get("Model"))
    t_orig = _parse_exif_time(exif.get("DateTimeOriginal"))
    t_mod = _parse_exif_time(exif.get("DateTime"))
    now = dt.datetime.now()
    ts_issues = []
    for label, t in (("DateTimeOriginal", t_orig), ("DateTime", t_mod)):
        if t is not None and (t.year < 1990 or t > now + dt.timedelta(days=1)):
            ts_issues.append(f"{label} out of plausible range")
    if t_orig and t_mod and t_orig > t_mod + dt.timedelta(seconds=60):
        ts_issues.append("DateTimeOriginal is later than DateTime (modified before captured)")
    thumb = _thumbnail_check(raw, img_bgr) if fmt == "JPEG" else None
    metadata_absent = not exif and not xmp and not png_text

    features = {
        "generator_tag": float(bool(generator_hits or generator_keys)),
        "editor_tag": float(bool(editor_hits)),
        "camera_present": float(camera_present),
        "timestamp_inconsistent": float(bool(ts_issues)),
        "thumbnail_mismatch": float(bool(thumb and thumb["mismatch"])),
        "metadata_absent": float(metadata_absent),
    }
    flags = features["generator_tag"] + features["editor_tag"] + features["timestamp_inconsistent"] + features["thumbnail_mismatch"] + features["metadata_absent"]
    return IndicatorResult(
        id="exif_metadata",
        value=flags,
        unit="flags",
        features=features,
        details={
            "format": fmt,
            "exif": exif,
            "xmp_present": bool(xmp),
            "png_text_keys": sorted(png_text.keys()),
            "generator_signatures": generator_hits + [f"png:{k}" for k in generator_keys],
            "editor_signatures": editor_hits,
            "timestamp_issues": ts_issues,
            "thumbnail": thumb,
        },
    )
