"""Container / encoding forensics via ffprobe (§5.2.6). Also applied to audio files."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

from app.pipeline.media import require_ffmpeg
from app.pipeline.types import IndicatorResult

EDITOR_PATTERNS = [r"premiere", r"after effects", r"davinci", r"resolve", r"final cut", r"imovie", r"capcut", r"filmora",
                   r"veed", r"kapwing", r"inshot", r"descript", r"handbrake", r"vegas", r"shotcut", r"openshot", r"kdenlive",
                   r"audacity", r"adobe audition", r"elevenlabs", r"murf", r"resemble"]
REENCODE_PATTERNS = [r"^lavf", r"lavc", r"ffmpeg", r"x264", r"x265"]


def _packet_intervals(path: Path, max_seconds: float) -> np.ndarray | None:
    require_ffmpeg()
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time",
                          "-read_intervals", f"%+{max_seconds}", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        return None
    ts = sorted(float(x) for x in re.findall(r"[-\d.]+", out.stdout) if x not in ("", "-", "."))
    if len(ts) < 10:
        return None
    d = np.diff(np.asarray(ts))
    return d[d > 0]


def analyze_container(path: str | Path, probe: dict[str, Any], max_seconds: float) -> IndicatorResult:
    path = Path(path)
    fmt = probe.get("format", {})
    streams = probe.get("streams", [])
    tags: dict[str, str] = {str(k).lower(): str(v) for k, v in (fmt.get("tags") or {}).items()}
    for s in streams:
        for k, v in (s.get("tags") or {}).items():
            tags.setdefault(f"{s.get('codec_type')}.{str(k).lower()}", str(v))
    text = " ".join(f"{k}={v}" for k, v in tags.items()).lower()
    editors = sorted({p for p in EDITOR_PATTERNS if re.search(p, text)})
    encoder_vals = [v for k, v in tags.items() if "encoder" in k or "handler_name" in k or "software" in k]
    reencode = sorted({p for p in REENCODE_PATTERNS for v in encoder_vals if re.search(p, v.lower())})
    creation = next((v for k, v in tags.items() if "creation_time" in k or k.endswith("date")), None)
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    features = {"editor_tag": float(bool(editors)), "missing_creation_time": float(creation is None),
                "reencode_trace": float(bool(reencode))}
    details: dict[str, Any] = {
        "container": fmt.get("format_name"), "encoder_tags": encoder_vals[:6], "editor_signatures": editors,
        "reencode_signatures": reencode, "creation_time": creation,
        "video_codec": video.get("codec_name") if video else None, "audio_codec": audio.get("codec_name") if audio else None,
        "audio_sample_rate": int(audio["sample_rate"]) if audio and audio.get("sample_rate") else None,
        "bit_rate": fmt.get("bit_rate"),
    }
    value = None
    if video is not None:
        details.update({"r_frame_rate": video.get("r_frame_rate"), "avg_frame_rate": video.get("avg_frame_rate")})
        d = _packet_intervals(path, max_seconds)
        if d is not None and d.size > 5:
            cv = float(d.std() / d.mean()) if d.mean() > 0 else 0.0
            features["interval_cv"] = cv
            value = cv
            details["frame_interval_ms"] = {"mean": round(float(d.mean() * 1000), 3), "max": round(float(d.max() * 1000), 3)}
    return IndicatorResult(id="container", value=value if value is not None else float(features["editor_tag"] + features["reencode_trace"]),
                           unit="interval CV" if value is not None else "flags", features=features, details=details)
