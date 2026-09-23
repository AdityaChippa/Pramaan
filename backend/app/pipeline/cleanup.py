"""Deletes live-chunks objects older than LIVE_CHUNK_TTL_HOURS. Runs at engine startup and hourly."""
from __future__ import annotations

import datetime as dt
import logging
from typing import Any

log = logging.getLogger("pramaan.cleanup")
BUCKET = "live-chunks"


def _parse(ts: str | None) -> dt.datetime | None:
    if not ts:
        return None
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def sweep_live_chunks(io: Any, ttl_hours: float) -> int:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=ttl_hours)
    stale: list[str] = []

    def walk(prefix: str, depth: int) -> None:
        for entry in io.list(BUCKET, prefix):
            name = f"{prefix}/{entry['name']}" if prefix else entry["name"]
            if entry.get("id") is None:  # folder placeholder
                if depth < 4:
                    walk(name, depth + 1)
                continue
            created = _parse(entry.get("created_at") or entry.get("updated_at"))
            if created is not None and created < cutoff:
                stale.append(name)

    walk("", 0)
    for i in range(0, len(stale), 100):
        io.remove(BUCKET, stale[i:i + 100])
    if stale:
        log.info("removed %d stale live chunks", len(stale))
    return len(stale)
