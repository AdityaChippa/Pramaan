from __future__ import annotations

import threading
import time

from fastapi import APIRouter, Depends

from app.api.analyze import queue_status
from app.deps import require_engine_secret
from app.models.loader import get_provider

router = APIRouter()
STARTED = time.time()


@router.get("/health")
def health() -> dict:
    provider = get_provider()
    return {"status": "ok", "uptime_s": round(time.time() - STARTED, 1), "models": provider.status(), "queue": queue_status()}


@router.post("/models/reload", dependencies=[Depends(require_engine_secret)], status_code=202)
def reload_models() -> dict:
    provider = get_provider()
    if not provider.loading:
        threading.Thread(target=provider.reload, daemon=True).start()
    return {"accepted": True}
