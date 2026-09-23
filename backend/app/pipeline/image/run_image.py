"""Image detectors (§5.1). Also reused on a representative video frame for the thumbnail/preview."""
from __future__ import annotations

from typing import Any

import numpy as np

from app.pipeline.artifacts import ArtifactBag, make_thumbnail
from app.pipeline.faces import detect_faces
from app.pipeline.image.blending import analyze_blending
from app.pipeline.image.ela import analyze_ela
from app.pipeline.image.face_cnn import analyze_face_cnn_image
from app.pipeline.image.frequency import analyze_frequency
from app.pipeline.image.lighting import analyze_lighting
from app.pipeline.image.noise import analyze_noise
from app.pipeline.image.univfd import analyze_univfd
from app.pipeline.types import IndicatorResult, safe_run


def run_image(img_bgr: np.ndarray, provider: Any, bag: ArtifactBag, occlusion_grid: int = 7) -> tuple[list[IndicatorResult], dict[str, Any]]:
    bag.add("original_preview", "Original", "original", img_bgr)
    bag.thumbnail = make_thumbnail(img_bgr)
    faces = detect_faces(img_bgr)
    results = [
        safe_run("face_cnn", lambda: analyze_face_cnn_image(provider.face_cnn, img_bgr, faces, bag)),
        safe_run("univfd", lambda: analyze_univfd(provider.univfd, img_bgr, bag, occlusion_grid)),
        safe_run("freq_spectrum", lambda: analyze_frequency(img_bgr, bag)),
        safe_run("blend_boundary", lambda: analyze_blending(img_bgr, faces, bag)),
        safe_run("ela", lambda: analyze_ela(img_bgr, faces, bag)),
        safe_run("noise_residual", lambda: analyze_noise(img_bgr, bag)),
        safe_run("lighting", lambda: analyze_lighting(img_bgr, faces)),
    ]
    info = {"faces_detected": len(faces), "faces_with_mesh": sum(1 for f in faces if f.landmarks is not None),
            "width": int(img_bgr.shape[1]), "height": int(img_bgr.shape[0])}
    return results, info
