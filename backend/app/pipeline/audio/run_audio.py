"""Audio pipeline (§5.3), also applied to a video's audio track."""
from __future__ import annotations

from typing import Any

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.audio.aasist import analyze_aasist
from app.pipeline.audio.breath import analyze_breath
from app.pipeline.audio.load import AudioData
from app.pipeline.audio.prosody import analyze_prosody
from app.pipeline.audio.spectral import analyze_spectral
from app.pipeline.audio.splice import analyze_splice
from app.pipeline.types import IndicatorResult, safe_run


def run_audio(audio: AudioData, provider: Any, bag: ArtifactBag) -> list[IndicatorResult]:
    return [
        safe_run("aasist", lambda: analyze_aasist(provider.aasist, audio.y16k, bag)),
        safe_run("audio_spectral", lambda: analyze_spectral(audio.native, audio.native_sr, audio.y16k, bag)),
        safe_run("prosody", lambda: analyze_prosody(audio.y16k, bag)),
        safe_run("breath_pause", lambda: analyze_breath(audio.y16k, bag)),
        safe_run("splice", lambda: analyze_splice(audio.y16k, bag)),
    ]


AUDIO_IDS = ("aasist", "audio_spectral", "prosody", "breath_pause", "splice")


def audio_not_present(reason: str) -> list[IndicatorResult]:
    return [IndicatorResult.na(i, reason) for i in AUDIO_IDS]
