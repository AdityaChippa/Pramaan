"""Stage 2 — face crops (engine detector + crop) from images and uniformly sampled video frames."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import cv2

from training.common import Context, read_json, write_json

log = logging.getLogger("pramaan.extract")


def _crops_for_image(img_bgr, max_faces: int = 1):
    from app.pipeline.faces import crop_face, detect_faces

    faces = detect_faces(img_bgr, max_faces=max_faces)
    return [crop_face(img_bgr, f.box, 256)[0] for f in faces]


def extract(ctx: Context) -> dict[str, Any]:
    if not ({"image", "video"} & set(ctx.modalities)):
        return {"skipped": "no image/video modality requested"}
    from app.pipeline.analyze_local import load_image_bgr
    from app.pipeline.video.frames import open_video, sample_uniform

    out = ctx.stage_dir("extract")
    crops_dir = out / "crops"
    manifest_path = out / "crops.json"
    manifest: dict[str, list[str]] = read_json(manifest_path, {}) or {}
    items = [it for it in ctx.splits()["items"] if it["modality"] in ("image", "video")]
    n_frames = int(ctx.b["video_frames_for_crops"])
    failures = 0
    for i, it in enumerate(items):
        sha = it["sha256"]
        if sha in manifest:
            continue
        paths: list[str] = []
        try:
            if it["modality"] == "image":
                frames = [load_image_bgr(it["path"])]
            else:
                info = open_video(it["path"], 60.0, None)
                frames = [f.image for f in sample_uniform(info, n_frames)]
            for k, frame in enumerate(frames):
                for j, crop_rgb in enumerate(_crops_for_image(frame)):
                    p = crops_dir / sha[:2] / f"{sha}_{k:02d}_{j}.jpg"
                    p.parent.mkdir(parents=True, exist_ok=True)
                    cv2.imwrite(str(p), cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])
                    paths.append(str(p))
        except Exception as exc:  # noqa: BLE001
            failures += 1
            log.warning("extract failed for %s: %s", it["path"], exc)
        manifest[sha] = paths
        if (i + 1) % 100 == 0:
            write_json(manifest_path, manifest)
            log.info("extracted %d/%d items", i + 1, len(items))
    write_json(manifest_path, manifest)
    with_face = sum(1 for it in items if manifest.get(it["sha256"]))
    return {"items": len(items), "items_with_face": with_face, "crops": sum(len(v) for v in manifest.values()), "failures": failures}


def crop_items(ctx: Context, split_names: tuple[str, ...]) -> list[tuple[str, int]]:
    manifest = read_json(ctx.work / "extract" / "crops.json", {}) or {}
    out = []
    for it in ctx.splits()["items"]:
        if it["modality"] in ("image", "video") and it["split"] in split_names:
            out += [(p, it["label"]) for p in manifest.get(it["sha256"], []) if Path(p).exists()]
    return out
