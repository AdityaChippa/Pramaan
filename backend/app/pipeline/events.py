"""Step reporters: Supabase-backed (custody + live progress) or a no-op for offline analysis."""
from __future__ import annotations

import contextlib
import time
from typing import Any, Iterator, Protocol

from app.pipeline.types import clean_json


class Reporter(Protocol):
    def step(self, name: str, **detail: Any) -> contextlib.AbstractContextManager[dict[str, Any]]: ...
    def skip(self, name: str, reason: str) -> None: ...


class NullReporter:
    @contextlib.contextmanager
    def step(self, name: str, **detail: Any) -> Iterator[dict[str, Any]]:
        d: dict[str, Any] = dict(detail)
        yield d

    def skip(self, name: str, reason: str) -> None:
        return None


class EventReporter:
    """Each step writes a `case_events` row at start and completes it with duration and detail."""

    def __init__(self, io: Any, case_id: str) -> None:
        self.io = io
        self.case_id = case_id

    @contextlib.contextmanager
    def step(self, name: str, **detail: Any) -> Iterator[dict[str, Any]]:
        d: dict[str, Any] = dict(detail)
        t0 = time.perf_counter()
        event_id = self.io.insert_event(self.case_id, name, "started", clean_json(d))
        try:
            yield d
        except Exception as exc:
            d["error"] = f"{type(exc).__name__}: {exc}"[:800]
            d["duration_ms"] = round((time.perf_counter() - t0) * 1000, 1)
            self.io.finish_event(event_id, "error", clean_json(d))
            raise
        d["duration_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        self.io.finish_event(event_id, "ok", clean_json(d))

    def skip(self, name: str, reason: str) -> None:
        event_id = self.io.insert_event(self.case_id, name, "started", {})
        self.io.finish_event(event_id, "skipped", {"reason": reason})
