"""PRAMAAN inference engine (FastAPI, Hugging Face Docker Space, port 7860)."""
from __future__ import annotations

import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analyze, health, live
from app.config import get_settings
from app.models.loader import get_provider
from app.pipeline.cleanup import sweep_live_chunks
from app.pipeline.run import pending_case_ids
from app.supabase_io import SupabaseIO

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pramaan")
settings = get_settings()  # fails fast with the names of missing variables


def _active_signature(io: SupabaseIO) -> dict[str, str]:
    return {r["name"]: r["version"] for r in io.active_models()}


def _background() -> None:
    io = SupabaseIO()
    provider = get_provider()
    provider.reload()
    try:
        for cid in pending_case_ids(io):
            analyze.enqueue(cid)
    except Exception:  # noqa: BLE001
        log.exception("could not resume pending cases")
    last_sweep = 0.0
    while True:
        now = time.time()
        if now - last_sweep >= 3600:
            try:
                sweep_live_chunks(io, settings.LIVE_CHUNK_TTL_HOURS)
            except Exception:  # noqa: BLE001
                log.exception("live-chunks sweep failed")
            last_sweep = now
        try:
            if not provider.loading and _active_signature(io) != provider.versions:
                log.info("model_registry changed — reloading active models")
                provider.reload()
        except Exception:  # noqa: BLE001
            log.exception("registry check failed")
        time.sleep(600)


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=_background, daemon=True, name="engine-background").start()
    yield


app = FastAPI(title="PRAMAAN engine", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["GET", "POST"],
                   allow_headers=["content-type", "x-engine-secret"])
app.include_router(health.router)
app.include_router(analyze.router)
app.include_router(live.router)
