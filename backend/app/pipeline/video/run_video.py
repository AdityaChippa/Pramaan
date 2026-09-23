"""Video pipeline (§5.2): per-frame CNN, then one tracked pass for temporal/biological signals."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.pipeline.artifacts import ArtifactBag, make_thumbnail
from app.pipeline.events import Reporter
from app.pipeline.types import IndicatorResult, safe_run
from app.pipeline.video.av_sync import analyze_av_sync
from app.pipeline.video.blink import analyze_blink
from app.pipeline.video.container import analyze_container
from app.pipeline.video.face_timeline import analyze_frame_scores, track_face
from app.pipeline.video.frames import VideoInfo, sample_uniform
from app.pipeline.video.jitter import analyze_jitter
from app.pipeline.video.rppg import analyze_rppg


def representative_frame(info: VideoInfo) -> np.ndarray | None:
    frames = sample_uniform(info, 3)
    return frames[len(frames) // 2].image if frames else None


def run_video(path: str, info: VideoInfo, probe: dict[str, Any], provider: Any, bag: ArtifactBag, reporter: Reporter,
              n_samples: int, temporal_fps: float, max_seconds: float,
              audio16k: np.ndarray | None) -> list[IndicatorResult]:
    results: list[IndicatorResult] = []
    with reporter.step("video_frames", samples=n_samples) as d:
        frames = sample_uniform(info, n_samples)
        if frames:
            mid = frames[len(frames) // 2].image
            bag.thumbnail = make_thumbnail(mid)
            bag.add("original_preview", "Representative frame", "original", mid)
        r = safe_run("face_cnn", lambda: analyze_frame_scores(provider.face_cnn, frames, bag))
        results.append(r)
        d.update({"frames_decoded": len(frames), "face_cnn_status": r.status})
    with reporter.step("video_temporal", fps=temporal_fps) as d:
        track = None
        try:
            track = track_face(info, temporal_fps)
        except Exception as exc:  # noqa: BLE001
            for ind in ("landmark_jitter", "blink", "rppg", "av_sync"):
                results.append(IndicatorResult.err(ind, exc))
        if track is not None:
            results.append(safe_run("landmark_jitter", lambda: analyze_jitter(track, bag)))
            results.append(safe_run("blink", lambda: analyze_blink(track, bag)))
            results.append(safe_run("rppg", lambda: analyze_rppg(track, bag)))
            results.append(safe_run("av_sync", lambda: analyze_av_sync(track, audio16k, 16000, bag)))
            d.update({"tracked_frames": len(track.t), "face_seconds": round(track.face_seconds, 2),
                      "analysis_fps": round(track.fps, 2)})
        results.append(safe_run("container", lambda: analyze_container(path, probe, max_seconds)))
    return results


def bgr_from_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
