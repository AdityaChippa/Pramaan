"""Request dependencies."""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from app.config import get_settings


def require_engine_secret(x_engine_secret: str | None = Header(default=None)) -> None:
    expected = get_settings().ENGINE_SHARED_SECRET
    if not x_engine_secret or not hmac.compare_digest(x_engine_secret, expected):
        raise HTTPException(status_code=401, detail="invalid engine secret")
