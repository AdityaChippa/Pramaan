"""Video decoding: uniform frame sampling and a rate-limited frame stream."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import cv2
import numpy as np

from app.pipeline.media import transcode_for_opencv


@dataclass
class VideoInfo:
    path: Path
    fps: float
    frame_count: int
    duration_s: float
    width: int
    height: int
    transcoded: bool
    truncated: bool


@dataclass
class Frame:
    index: int
    t: float
    image: np.ndarray


def _probe_cv(path: Path) -> tuple[float, int, int, int]:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            return 0.0, 0, 0, 0
        return (float(cap.get(cv2.CAP_PROP_FPS) or 0), int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0),
                int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0))
    finally:
        cap.release()


def open_video(path: str | Path, max_seconds: float, probed_duration: float | None) -> VideoInfo:
    """Uses the file directly when OpenCV reports sane metadata; otherwise (e.g. MediaRecorder WebM,
    or clips longer than the cap) transcodes the capped segment to MJPEG so seeking is exact."""
    path = Path(path)
    fps, n, w, h = _probe_cv(path)
    duration = probed_duration if probed_duration else (n / fps if fps > 0 else 0.0)
    truncated = bool(duration and duration > max_seconds)
    bad = fps <= 0 or fps > 240 or n <= 0 or path.suffix.lower() in {".webm", ".mkv"}
    transcoded = False
    if bad or truncated:
        path = transcode_for_opencv(path, max_seconds)
        transcoded = True
        fps, n, w, h = _probe_cv(path)
        if fps <= 0 or n <= 0:
            raise RuntimeError("video could not be decoded after transcoding")
        duration = n / fps
    return VideoInfo(path=path, fps=fps, frame_count=n, duration_s=min(duration, max_seconds), width=w, height=h,
                     transcoded=transcoded, truncated=truncated)


def sample_uniform(info: VideoInfo, n_samples: int) -> list[Frame]:
    usable = min(info.frame_count, int(info.duration_s * info.fps) or info.frame_count)
    if usable <= 0:
        return []
    idxs = sorted(set(np.linspace(0, usable - 1, min(n_samples, usable)).round().astype(int).tolist()))
    cap = cv2.VideoCapture(str(info.path))
    frames: list[Frame] = []
    try:
        for i in idxs:
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ok, img = cap.read()
            if ok and img is not None:
                frames.append(Frame(index=i, t=i / info.fps, image=img))
    finally:
        cap.release()
    return frames


def stream(info: VideoInfo, target_fps: float) -> Iterator[Frame]:
    """Sequential decode keeping at most `target_fps` frames per second (timestamps from frame index)."""
    step = max(1, int(round(info.fps / target_fps))) if target_fps > 0 else 1
    limit = int(info.duration_s * info.fps) + 1
    cap = cv2.VideoCapture(str(info.path))
    try:
        i = 0
        while i < limit:
            ok = cap.grab()
            if not ok:
                break
            if i % step == 0:
                ok, img = cap.retrieve()
                if ok and img is not None:
                    yield Frame(index=i, t=i / info.fps, image=img)
            i += 1
    finally:
        cap.release()


def effective_fps(info: VideoInfo, target_fps: float) -> float:
    step = max(1, int(round(info.fps / target_fps))) if target_fps > 0 else 1
    return info.fps / step
