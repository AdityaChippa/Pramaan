"""Live Monitor (§7): lightweight 3-second chunk analysis and session aggregation."""
from __future__ import annotations

import datetime as dt
import hashlib
import math
from pathlib import Path
from typing import Any

import numpy as np

from app.config import AnalysisSettings
from app.pipeline.artifacts import ArtifactBag
from app.pipeline.audio.aasist import analyze_aasist
from app.pipeline.audio.load import load_audio
from app.pipeline.fusion.model import fuse, logit
from app.pipeline.media import ffprobe, has_audio_stream, has_video_stream
from app.pipeline.metadata.hashing import sha256_file
from app.pipeline.scoring import CATALOG, sigmoid, to_indicator_dict
from app.pipeline.types import IndicatorResult, clean_json, safe_run
from app.pipeline.video.blink import analyze_blink
from app.pipeline.video.face_timeline import analyze_frame_scores, track_face
from app.pipeline.video.frames import open_video, sample_uniform
from app.pipeline.video.jitter import analyze_jitter

LIVE_IDS = ("face_cnn", "landmark_jitter", "blink", "aasist")


def analyze_chunk(path: str | Path, provider: Any, settings: AnalysisSettings) -> dict[str, Any]:
    path = Path(path)
    bag = ArtifactBag()
    probe = ffprobe(path)
    results: list[IndicatorResult] = []
    if has_video_stream(probe):
        info = open_video(path, 10.0, None)
        frames = sample_uniform(info, 4)
        results.append(safe_run("face_cnn", lambda: analyze_frame_scores(provider.face_cnn, frames, bag, top_k=0)))
        try:
            track = track_face(info, settings.TEMPORAL_FPS)
            results.append(safe_run("landmark_jitter", lambda: analyze_jitter(track, bag, min_seconds=1.0)))
            results.append(safe_run("blink", lambda: analyze_blink(track, bag, min_face_seconds=2.0)))
        except Exception as exc:  # noqa: BLE001
            results += [IndicatorResult.err("landmark_jitter", exc), IndicatorResult.err("blink", exc)]
    else:
        results += [IndicatorResult.na(i, "No video in chunk") for i in ("face_cnn", "landmark_jitter", "blink")]
    if has_audio_stream(probe):
        try:
            audio = load_audio(path, 10.0)
            results.append(safe_run("aasist", lambda: analyze_aasist(provider.aasist, audio.y16k, bag)))
        except Exception as exc:  # noqa: BLE001
            results.append(IndicatorResult.err("aasist", exc))
    else:
        results.append(IndicatorResult.na("aasist", "No audio in chunk"))
    indicators = [to_indicator_dict(r, provider.fusion) for r in results]
    for ind in indicators:
        ind.pop("_artifact_key", None)
    fused = fuse(indicators, "live", provider.fusion)
    return clean_json({
        "sha256": sha256_file(path),
        "probability": fused["probability"],
        "verdict": fused["verdict"],
        "calibrated": fused["calibrated"],
        "thresholds": fused["thresholds"],
        "indicators": {i["id"]: {"status": i["status"], "score": i["score_0_1"], "value": i["value"], "unit": i["unit"],
                                 "features": i["features"], "reason": i["reason"]} for i in indicators},
        "model_versions": dict(provider.versions),
    })


def aggregate_session(session: dict[str, Any], windows: list[dict[str, Any]], provider: Any) -> dict[str, Any]:
    """Session case = per-indicator mean log-odds across windows (features averaged), fused with the live combo."""
    indicators = []
    for ind_id in LIVE_IDS:
        rows = [w["scores"]["indicators"].get(ind_id) for w in windows if w.get("scores")]
        ok = [r for r in rows if r and r.get("status") == "ok" and r.get("score") is not None]
        meta = CATALOG[ind_id]
        if not ok:
            reason = next((r.get("reason") for r in rows if r and r.get("reason")), None) or "No window produced a score"
            indicators.append({**to_indicator_dict(IndicatorResult.na(ind_id, reason), provider.fusion)})
            continue
        mean_logit = float(np.mean([logit(float(r["score"])) for r in ok]))
        feats: dict[str, list[float]] = {}
        for r in ok:
            for k, v in (r.get("features") or {}).items():
                if v is not None and math.isfinite(float(v)):
                    feats.setdefault(k, []).append(float(v))
        vals = [float(r["value"]) for r in ok if r.get("value") is not None]
        base = to_indicator_dict(IndicatorResult(id=ind_id, value=float(np.median(vals)) if vals else None,
                                                 features={k: float(np.mean(v)) for k, v in feats.items()},
                                                 details={"windows_scored": len(ok), "windows_total": len(rows),
                                                          "aggregation": "mean log-odds of window scores"}), provider.fusion)
        base["score_0_1"] = round(sigmoid(mean_logit), 6)
        base["unit"] = meta["unit"]
        indicators.append(base)
    for ind in indicators:
        ind.pop("_artifact_key", None)
    fused = fuse(indicators, "live", provider.fusion)
    chain = hashlib.sha256("".join((w.get("scores") or {}).get("sha256", "") for w in windows).encode()).hexdigest()
    timeline = [{"t": float(w["t_start"]), "p": (w.get("scores") or {}).get("probability")} for w in windows]
    return clean_json({
        "indicators": indicators,
        "fused": fused,
        "sha256": chain,
        "duration_s": float(windows[-1]["t_start"]) + 3.0 if windows else 0.0,
        "timeline": timeline,
        "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    })
