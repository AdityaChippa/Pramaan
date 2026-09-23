from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import require_engine_secret
from app.models.loader import get_provider
from app.pipeline.live import aggregate_session, analyze_chunk
from app.supabase_io import SupabaseIO, now_iso

router = APIRouter(prefix="/live", dependencies=[Depends(require_engine_secret)])


class ChunkRequest(BaseModel):
    session_id: str = Field(..., min_length=36, max_length=36)
    chunk_index: int = Field(..., ge=0, le=100000)
    chunk_path: str = Field(..., min_length=3, max_length=512)
    t_start: float = Field(..., ge=0)


class FinalizeRequest(BaseModel):
    session_id: str = Field(..., min_length=36, max_length=36)


def _chunk_job(req: ChunkRequest) -> dict:
    io = SupabaseIO()
    session = io.get_live_session(req.session_id)
    if session is None:
        raise HTTPException(404, "live session not found")
    if not req.chunk_path.startswith(f"{session['user_id']}/{req.session_id}/"):
        raise HTTPException(403, "chunk path outside session folder")
    tmp = Path(tempfile.mkdtemp(prefix="live_"))
    try:
        local = tmp / Path(req.chunk_path).name
        local.write_bytes(io.download("live-chunks", req.chunk_path))
        scores = analyze_chunk(local, get_provider(), get_settings())
        io.upsert_live_window({"session_id": req.session_id, "chunk_index": req.chunk_index, "chunk_path": req.chunk_path,
                               "t_start": req.t_start, "scores": scores})
        return {"chunk_index": req.chunk_index, "t_start": req.t_start, **scores}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@router.post("/analyze")
async def live_analyze(req: ChunkRequest) -> dict:
    return await run_in_threadpool(_chunk_job, req)


def _finalize_job(req: FinalizeRequest) -> dict:
    io = SupabaseIO()
    session = io.get_live_session(req.session_id)
    if session is None:
        raise HTTPException(404, "live session not found")
    windows = io.live_windows(req.session_id)
    if not windows:
        raise HTTPException(422, "session has no analyzed windows")
    provider = get_provider()
    agg = aggregate_session(session, windows, provider)
    fused = agg["fused"]
    case = io.insert_case({
        "user_id": session["user_id"], "media_type": "video", "source": "live", "filename": f"live-session-{req.session_id[:8]}",
        "status": "complete" if fused["probability"] is not None else "failed",
        "error": None if fused["probability"] is not None else "No live window produced a usable score",
        "sha256": agg["sha256"], "duration_s": agg["duration_s"], "verdict": fused["verdict"], "probability": fused["probability"],
        "calibrated": fused["calibrated"], "thresholds": fused["thresholds"], "modality_contributions": fused["contributions"],
        "indicators": agg["indicators"], "model_versions": dict(provider.versions),
        "artifacts": {"thumbnail_path": None, "original_preview_path": None, "overlays": [], "top_frames": [],
                      "series": {"frame_scores": [{"t": p["t"], "p": p["p"], "frame_index": i} for i, p in enumerate(agg["timeline"]) if p["p"] is not None]}},
        "completed_at": agg["completed_at"],
    })
    ev = io.insert_event(case["id"], "live_aggregate", "started", {})
    io.finish_event(ev, "ok", {"session_id": req.session_id, "windows": len(windows), "chain_sha256": agg["sha256"],
                               "chunk_sha256": [(w.get("scores") or {}).get("sha256") for w in windows][:400]})
    io.update_live_session(req.session_id, {"ended_at": now_iso(), "case_id": case["id"],
                                            "summary": {"windows": len(windows), "probability": fused["probability"], "verdict": fused["verdict"]}})
    return {"case_id": case["id"], "verdict": fused["verdict"], "probability": fused["probability"]}


@router.post("/finalize")
async def live_finalize(req: FinalizeRequest) -> dict:
    return await run_in_threadpool(_finalize_job, req)
