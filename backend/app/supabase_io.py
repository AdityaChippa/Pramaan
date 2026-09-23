"""All Supabase access used by the engine (service role)."""
from __future__ import annotations

import datetime as dt
import threading
from typing import Any

from supabase import Client, create_client

_lock = threading.Lock()
_client: Client | None = None


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def client(url: str | None = None, key: str | None = None) -> Client:
    global _client
    with _lock:
        if _client is None:
            if url is None or key is None:
                from app.config import get_settings

                s = get_settings()
                url, key = s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY
            _client = create_client(url, key)
        return _client


class SupabaseIO:
    def __init__(self, c: Client | None = None) -> None:
        self.c = c or client()

    # ── storage ──
    def download(self, bucket: str, path: str) -> bytes:
        return self.c.storage.from_(bucket).download(path)

    def upload(self, bucket: str, path: str, data: bytes, content_type: str, upsert: bool = True) -> None:
        self.c.storage.from_(bucket).upload(
            path, data, {"content-type": content_type, "upsert": "true" if upsert else "false"}
        )

    def remove(self, bucket: str, paths: list[str]) -> None:
        if paths:
            self.c.storage.from_(bucket).remove(paths)

    def list(self, bucket: str, prefix: str = "") -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = self.c.storage.from_(bucket).list(prefix, {"limit": 1000, "offset": offset})
            out.extend(page)
            if len(page) < 1000:
                return out
            offset += 1000

    # ── cases ──
    def get_case(self, case_id: str) -> dict[str, Any] | None:
        r = self.c.table("cases").select("*").eq("id", case_id).limit(1).execute()
        return r.data[0] if r.data else None

    def update_case(self, case_id: str, fields: dict[str, Any]) -> None:
        self.c.table("cases").update(fields).eq("id", case_id).execute()

    def insert_case(self, row: dict[str, Any]) -> dict[str, Any]:
        r = self.c.table("cases").insert(row).execute()
        return r.data[0]

    def user_phashes(self, user_id: str, exclude_case: str, limit: int = 2000) -> list[dict[str, Any]]:
        r = (
            self.c.table("cases")
            .select("id,sha256,phash,filename,created_at")
            .eq("user_id", user_id)
            .neq("id", exclude_case)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return r.data or []

    # ── events ──
    def insert_event(self, case_id: str, step: str, status: str, detail: dict[str, Any] | None = None) -> int:
        r = (
            self.c.table("case_events")
            .insert({"case_id": case_id, "step": step, "status": status, "started_at": now_iso(), "detail": detail or {}})
            .execute()
        )
        return int(r.data[0]["id"])

    def finish_event(self, event_id: int, status: str, detail: dict[str, Any]) -> None:
        self.c.table("case_events").update({"status": status, "finished_at": now_iso(), "detail": detail}).eq("id", event_id).execute()

    # ── live ──
    def get_live_session(self, session_id: str) -> dict[str, Any] | None:
        r = self.c.table("live_sessions").select("*").eq("id", session_id).limit(1).execute()
        return r.data[0] if r.data else None

    def upsert_live_window(self, row: dict[str, Any]) -> None:
        self.c.table("live_windows").upsert(row, on_conflict="session_id,chunk_index").execute()

    def live_windows(self, session_id: str) -> list[dict[str, Any]]:
        r = self.c.table("live_windows").select("*").eq("session_id", session_id).order("chunk_index").execute()
        return r.data or []

    def update_live_session(self, session_id: str, fields: dict[str, Any]) -> None:
        self.c.table("live_sessions").update(fields).eq("id", session_id).execute()

    # ── models ──
    def active_models(self) -> list[dict[str, Any]]:
        r = self.c.table("model_registry").select("*").eq("is_active", True).execute()
        return r.data or []
