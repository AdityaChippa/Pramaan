"""Indicator result type shared by every detector (inference and training)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable

STATUS_OK = "ok"
STATUS_NA = "not_applicable"
STATUS_ERROR = "error"
STATUS_INFO = "informational"


@dataclass
class IndicatorResult:
    id: str
    status: str = STATUS_OK
    value: float | None = None
    unit: str = ""
    features: dict[str, float] = field(default_factory=dict)
    reason: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    artifact_key: str | None = None

    @staticmethod
    def na(ind_id: str, reason: str) -> "IndicatorResult":
        return IndicatorResult(id=ind_id, status=STATUS_NA, reason=reason)

    @staticmethod
    def err(ind_id: str, exc: BaseException) -> "IndicatorResult":
        return IndicatorResult(id=ind_id, status=STATUS_ERROR, reason=f"{type(exc).__name__}: {exc}"[:500])


def finite(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return default
    return v if math.isfinite(v) else default


def clean_json(obj: Any) -> Any:
    """Recursively convert numpy types and non-finite floats into JSON-safe values."""
    try:
        import numpy as np
    except ImportError:  # pragma: no cover
        np = None  # type: ignore
    if isinstance(obj, dict):
        return {str(k): clean_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean_json(v) for v in obj]
    if np is not None:
        if isinstance(obj, np.ndarray):
            return clean_json(obj.tolist())
        if isinstance(obj, np.generic):
            obj = obj.item()
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    return obj


def safe_run(ind_id: str, fn: Callable[[], IndicatorResult]) -> IndicatorResult:
    """A failing indicator never kills the case: it is recorded as `error` and fusion skips it."""
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 — deliberate isolation boundary
        return IndicatorResult.err(ind_id, exc)
