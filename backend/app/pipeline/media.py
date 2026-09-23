"""Media probing and decoding via ffprobe/ffmpeg."""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
VIDEO_EXT = {".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v"}
AUDIO_EXT = {".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aac", ".opus"}


def require_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"{tool} not found on PATH — install ffmpeg (see RUN_GUIDE §1)")


def ffprobe(path: str | Path) -> dict[str, Any]:
    require_ffmpeg()
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout or "{}")


def has_audio_stream(probe: dict[str, Any]) -> bool:
    return any(s.get("codec_type") == "audio" for s in probe.get("streams", []))


def has_video_stream(probe: dict[str, Any]) -> bool:
    return any(s.get("codec_type") == "video" and s.get("disposition", {}).get("attached_pic", 0) == 0 for s in probe.get("streams", []))


def duration_s(probe: dict[str, Any]) -> float | None:
    d = probe.get("format", {}).get("duration")
    try:
        return float(d) if d is not None else None
    except ValueError:
        return None


def detect_media_type(path: str | Path, mime: str | None = None) -> str:
    ext = Path(path).suffix.lower()
    if mime:
        if mime.startswith("image/"):
            return "image"
        if mime.startswith("video/"):
            return "video"
        if mime.startswith("audio/"):
            return "audio"
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    probe = ffprobe(path)
    if has_video_stream(probe):
        return "video"
    if has_audio_stream(probe):
        return "audio"
    raise ValueError("unsupported media: no image, video or audio stream found")


def decode_audio(path: str | Path, sr: int | None = 16000, max_seconds: float | None = None) -> tuple[np.ndarray, int]:
    """Decode the first audio stream to mono float32. sr=None keeps the native sample rate."""
    require_ffmpeg()
    native_sr = sr
    if sr is None:
        probe = ffprobe(path)
        a = next((s for s in probe.get("streams", []) if s.get("codec_type") == "audio"), None)
        if a is None:
            raise ValueError("no audio stream")
        native_sr = int(a.get("sample_rate", 16000))
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", str(native_sr)]
    if max_seconds:
        cmd += ["-t", str(max_seconds)]
    cmd += ["-f", "f32le", "-"]
    out = subprocess.run(cmd, capture_output=True, timeout=300)
    if out.returncode != 0:
        raise RuntimeError(f"ffmpeg audio decode failed: {out.stderr.decode(errors='ignore')[:300]}")
    y = np.frombuffer(out.stdout, dtype=np.float32).copy()
    return y, int(native_sr or 16000)


def transcode_for_opencv(path: str | Path, max_seconds: float) -> Path:
    """Re-encode to MJPEG AVI so OpenCV can seek/decode formats it struggles with (e.g. MediaRecorder WebM)."""
    require_ffmpeg()
    tmp = Path(tempfile.mkdtemp(prefix="pramaan_")) / "decoded.avi"
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(path), "-t", str(max_seconds), "-an",
           "-vf", "scale='min(1280,iw)':-2", "-c:v", "mjpeg", "-q:v", "3", str(tmp)]
    out = subprocess.run(cmd, capture_output=True, timeout=600)
    if out.returncode != 0:
        raise RuntimeError(f"ffmpeg video transcode failed: {out.stderr.decode(errors='ignore')[:300]}")
    return tmp


def load_image_bgr(path: str | Path, max_side: int = 4096) -> np.ndarray:
    """Decode any Pillow-supported still image, apply EXIF orientation, return BGR uint8 (capped side)."""
    import cv2
    from PIL import Image, ImageOps

    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
        arr = np.asarray(im.convert("RGB"))
    img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img
