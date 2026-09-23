"""In-memory evidence artifacts and their upload to Supabase Storage."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np


@dataclass
class ArtifactImage:
    key: str
    label: str
    indicator_id: str
    image: np.ndarray
    frame_index: int | None = None
    t: float | None = None
    original_key: str | None = None


@dataclass
class ArtifactBag:
    images: dict[str, ArtifactImage] = field(default_factory=dict)
    series: dict[str, Any] = field(default_factory=dict)
    top_frames: list[dict[str, Any]] = field(default_factory=list)
    thumbnail: np.ndarray | None = None

    def add(self, key: str, label: str, indicator_id: str, image: np.ndarray, **kw: Any) -> str:
        self.images[key] = ArtifactImage(key=key, label=label, indicator_id=indicator_id, image=image, **kw)
        return key


def encode_png(img: np.ndarray, max_side: int = 1280) -> bytes:
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".png", img, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        raise RuntimeError("PNG encoding failed")
    return buf.tobytes()


def make_thumbnail(img: np.ndarray, size: int = 480) -> np.ndarray:
    h, w = img.shape[:2]
    s = size / max(h, w)
    return cv2.resize(img, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA) if s < 1 else img


def upload_bag(io: Any, bag: ArtifactBag, user_id: str, case_id: str, indicators: list[dict[str, Any]]) -> dict[str, Any]:
    """Uploads PNG artifacts under overlays/<user>/<case>/ and resolves indicator evidence paths."""
    prefix = f"{user_id}/{case_id}"
    paths: dict[str, str] = {}
    for key, art in bag.images.items():
        path = f"{prefix}/{key}.png"
        io.upload("overlays", path, encode_png(art.image), "image/png")
        paths[key] = path
    thumb_path = None
    if bag.thumbnail is not None:
        thumb_path = f"{prefix}/thumbnail.png"
        io.upload("overlays", thumb_path, encode_png(bag.thumbnail, 480), "image/png")

    overlays = []
    for key, art in bag.images.items():
        overlays.append({
            "id": key,
            "label": art.label,
            "path": paths[key],
            "indicator_id": art.indicator_id,
            "frame_index": art.frame_index,
            "t": art.t,
            "original_path": paths.get(art.original_key) if art.original_key else None,
        })
    for ind in indicators:
        k = ind.pop("_artifact_key", None)
        if k and k in paths:
            ind["evidence_artifact_url"] = paths[k]
    top = []
    for tf in bag.top_frames:
        top.append({
            "frame_index": tf["frame_index"],
            "t": tf["t"],
            "p": tf["p"],
            "original_path": paths.get(tf["original_key"], ""),
            "overlay_path": paths.get(tf["overlay_key"], ""),
        })
    return {
        "thumbnail_path": thumb_path,
        "original_preview_path": paths.get("original_preview"),
        "overlays": [o for o in overlays if o["id"] != "original_preview" and not o["id"].startswith("frame_orig_")],
        "top_frames": top,
        "series": bag.series,
    }
