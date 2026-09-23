from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import require_engine_secret
from app.pipeline.run import process_case

router = APIRouter()
_executor: ThreadPoolExecutor | None = None
_inflight: set[str] = set()
_lock = threading.Lock()


class AnalyzeRequest(BaseModel):
    case_id: str = Field(..., min_length=36, max_length=36)


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=max(1, get_settings().MAX_CONCURRENT_JOBS), thread_name_prefix="case")
    return _executor


def _run(case_id: str) -> None:
    try:
        process_case(case_id)
    finally:
        with _lock:
            _inflight.discard(case_id)


def enqueue(case_id: str) -> bool:
    with _lock:
        if case_id in _inflight:
            return False
        _inflight.add(case_id)
    _get_executor().submit(_run, case_id)
    return True


def queue_status() -> dict:
    with _lock:
        return {"inflight": len(_inflight), "workers": max(1, get_settings().MAX_CONCURRENT_JOBS)}


@router.post("/analyze", status_code=202, dependencies=[Depends(require_engine_secret)])
def analyze(req: AnalyzeRequest) -> dict:
    accepted = enqueue(req.case_id)
    if not accepted:
        raise HTTPException(status_code=409, detail="case already queued")
    return {"case_id": req.case_id, "status": "queued"}
