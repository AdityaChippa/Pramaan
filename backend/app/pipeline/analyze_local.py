"""Service-independent analysis of one media file. Used by the engine (run.py) and by training
(handcrafted_features stage) so features are computed identically in both."""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.config import AnalysisSettings
from app.pipeline.artifacts import ArtifactBag, make_thumbnail
from app.pipeline.audio.load import AudioData, load_audio
from app.pipeline.audio.run_audio import audio_not_present, run_audio
from app.pipeline.events import NullReporter, Reporter
from app.pipeline.fusion.model import select_combo
from app.pipeline.image.run_image import run_image
from app.pipeline.media import detect_media_type, duration_s, ffprobe, has_audio_stream
from app.pipeline.metadata.hashing import phash, sha256_file
from app.pipeline.metadata.run_metadata import run_metadata
from app.pipeline.plots import waveform_image
from app.pipeline.types import IndicatorResult, safe_run
from app.pipeline.video.container import analyze_container
from app.pipeline.video.frames import open_video
from app.pipeline.video.run_video import representative_frame, run_video

IMAGE_ONLY = ("univfd", "freq_spectrum", "blend_boundary", "ela", "noise_residual", "lighting")
VIDEO_ONLY = ("landmark_jitter", "blink", "rppg", "av_sync")


@dataclass
class AnalysisOutput:
    media_type: str
    combo: str
    results: list[IndicatorResult]
    bag: ArtifactBag
    meta: dict[str, Any] = field(default_factory=dict)


def load_image_bgr(path: str | Path) -> np.ndarray:
    """Pillow decode with EXIF orientation applied (also handles non-ASCII Windows paths)."""
    with Image.open(io.BytesIO(Path(path).read_bytes())) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)


def analyze_file(
    path: str | Path,
    *,
    provider: Any,
    settings: AnalysisSettings,
    media_type: str | None = None,
    mime: str | None = None,
    reporter: Reporter | None = None,
    prior_hashes: list[dict[str, Any]] | None = None,
    client_sha256: str | None = None,
) -> AnalysisOutput:
    rep = reporter or NullReporter()
    path = Path(path)
    bag = ArtifactBag()
    results: list[IndicatorResult] = []
    meta: dict[str, Any] = {"file_size": path.stat().st_size}

    with rep.step("hash") as d:
        sha = sha256_file(path)
        mt = media_type or detect_media_type(path, mime)
        image_bgr = None
        probe: dict[str, Any] = {}
        ph = None
        if mt == "image":
            image_bgr = load_image_bgr(path)
            ph = phash(image_bgr)
        else:
            probe = ffprobe(path)
        meta.update({"sha256": sha, "media_type": mt})
        d.update({"sha256": sha, "algorithm": "SHA-256", "bytes": meta["file_size"]})
        if client_sha256:
            d["client_sha256_match"] = client_sha256.lower() == sha
            if client_sha256.lower() != sha:
                raise ValueError("SHA-256 computed by the engine does not match the hash computed in the browser — upload corrupted or altered")

    info = None
    if mt == "video":
        info = open_video(path, settings.MAX_VIDEO_SECONDS, duration_s(probe))
        frame = representative_frame(info)
        ph = phash(frame) if frame is not None else None
    meta["phash"] = ph

    with rep.step("metadata") as d:
        md = run_metadata(path, mt, image_bgr, sha, ph, prior_hashes)
        results.extend(md)
        d.update({"phash": ph, **{r.id: r.status for r in md}})

    with rep.step("routing") as d:
        has_audio = mt == "audio" or (mt == "video" and has_audio_stream(probe))
        dur = duration_s(probe) if mt != "image" else None
        combo = select_combo(mt, has_audio)
        meta.update({"duration_s": dur, "has_audio": has_audio})
        d.update({"media_type": mt, "has_audio": has_audio, "duration_s": dur, "combo": combo,
                  "truncated_to_s": settings.MAX_VIDEO_SECONDS if dur and dur > settings.MAX_VIDEO_SECONDS else None})

    if mt == "image":
        with rep.step("image_detectors") as d:
            img_results, img_info = run_image(image_bgr, provider, bag, settings.UNIVFD_OCCLUSION_GRID)
            results.extend(img_results)
            d.update(img_info)
        rep.skip("video_frames", "still image")
        rep.skip("video_temporal", "still image")
        rep.skip("audio", "still image — no audio track")
        results.extend(IndicatorResult.na(i, "Temporal indicator — not applicable to a still image") for i in VIDEO_ONLY)
        results.extend(audio_not_present("Not analyzed — still image has no audio track"))
        results.append(IndicatorResult.na("container", "Container forensics applies to video/audio files"))
    else:
        rep.skip("image_detectors", f"{mt} input — full image detector battery applies to still images")
        results.extend(IndicatorResult.na(i, "Still-image indicator — not run on video/audio") for i in IMAGE_ONLY)
        audio: AudioData | None = None
        audio_error: BaseException | None = None
        if has_audio:
            try:
                audio = load_audio(path, settings.MAX_VIDEO_SECONDS)
            except Exception as exc:  # noqa: BLE001
                audio_error = exc
        if mt == "video":
            assert info is not None
            meta["video"] = {"fps": info.fps, "frames": info.frame_count, "width": info.width, "height": info.height,
                             "transcoded": info.transcoded, "truncated": info.truncated}
            results.extend(run_video(str(path), info, probe, provider, bag, rep, settings.VIDEO_SAMPLE_FRAMES,
                                     settings.TEMPORAL_FPS, settings.MAX_VIDEO_SECONDS, audio.y16k if audio else None))
        else:
            rep.skip("video_frames", "audio input")
            rep.skip("video_temporal", "audio input")
            results.extend(IndicatorResult.na(i, "Not analyzed — no video stream") for i in ("face_cnn",) + VIDEO_ONLY)
            results.append(safe_run("container", lambda: analyze_container(path, probe, settings.MAX_VIDEO_SECONDS)))
        if audio is not None:
            with rep.step("audio", seconds=round(audio.duration_s, 2), native_sample_rate=audio.native_sr) as d:
                ar = run_audio(audio, provider, bag)
                results.extend(ar)
                d.update({r.id: r.status for r in ar})
            if mt == "audio":
                wf = waveform_image(audio.y16k)
                bag.thumbnail = make_thumbnail(wf)
        elif audio_error is not None:
            with rep.step("audio") as d:
                d["decode_error"] = str(audio_error)[:300]
            results.extend(IndicatorResult.err(i, audio_error) for i in ("aasist", "audio_spectral", "prosody", "breath_pause", "splice"))
        else:
            rep.skip("audio", "no audio track")
            results.extend(audio_not_present("Not analyzed — no audio track"))

    # One result per catalog indicator, first occurrence wins.
    seen: set[str] = set()
    unique = []
    for r in results:
        if r.id not in seen:
            seen.add(r.id)
            unique.append(r)
    return AnalysisOutput(media_type=mt, combo=combo, results=unique, bag=bag, meta=meta)
