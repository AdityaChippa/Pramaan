"""Metadata & provenance stage (all media types)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from app.pipeline.metadata.c2pa_check import analyze_c2pa
from app.pipeline.metadata.duplicates import analyze_duplicates
from app.pipeline.metadata.exif import analyze_image_metadata
from app.pipeline.types import IndicatorResult, safe_run


def run_metadata(
    path: str | Path,
    media_type: str,
    image_bgr: np.ndarray | None,
    sha256: str,
    phash: str | None,
    prior: list[dict[str, Any]] | None,
) -> list[IndicatorResult]:
    results: list[IndicatorResult] = []
    if media_type == "image" and image_bgr is not None:
        results.append(safe_run("exif_metadata", lambda: analyze_image_metadata(path, image_bgr)))
    else:
        results.append(IndicatorResult.na("exif_metadata", "EXIF/XMP applies to still images; container tags are analyzed by the container indicator"))
    results.append(safe_run("c2pa", lambda: analyze_c2pa(path)))
    results.append(safe_run("duplicate", lambda: analyze_duplicates(sha256, phash, prior)))
    return results
