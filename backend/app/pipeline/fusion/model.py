"""Fusion by L2-regularised logistic regression with exact log-odds contributions."""
from __future__ import annotations

import math
from typing import Any

from app.pipeline.fusion.defaults import COMBOS, default_fusion_config
from app.pipeline.fusion.verdict import verdict_for
from app.pipeline.scoring import CATALOG, sigmoid
from app.pipeline.types import finite

GROUPS = ("visual", "temporal", "audio", "provenance")


def select_combo(media_type: str, has_audio: bool, live: bool = False) -> str:
    if live:
        return "live"
    if media_type == "image":
        return "image"
    if media_type == "audio":
        return "audio"
    return "video_audio" if has_audio else "video"


def logit(p: float, eps: float = 1e-4) -> float:
    p = min(1 - eps, max(eps, p))
    return math.log(p / (1 - p))


def fuse(indicators: list[dict[str, Any]], combo: str, fusion_cfg: dict[str, Any] | None) -> dict[str, Any]:
    cfg = fusion_cfg if fusion_cfg and combo in fusion_cfg.get("combos", {}) else default_fusion_config()
    m = cfg["combos"][combo]
    # A trained file may still carry default entries for combos that lacked training data.
    calibrated = bool(cfg.get("calibrated")) and cfg is fusion_cfg and bool(m.get("calibrated", True))
    x_clip = finite(cfg.get("x_clip", 8.0), 8.0)
    by_id = {i["id"]: i for i in indicators}
    a = finite(m.get("temperature_a", 1.0), 1.0)
    beta = finite(m.get("temperature_b", 0.0))
    b = finite(m.get("intercept", 0.0))

    rows = []
    z = b
    for fid in m["features"]:
        ind = by_id.get(fid)
        usable = ind is not None and ind.get("status") == "ok" and ind.get("score_0_1") is not None
        mask = 1.0 if usable else 0.0
        x = max(-x_clip, min(x_clip, logit(float(ind["score_0_1"])))) if usable else 0.0
        w = finite(m["weights"].get(fid, 0.0))
        v = finite(m.get("mask_weights", {}).get(fid, 0.0))
        raw = w * x * mask + v * mask
        z += raw
        rows.append({
            "id": fid,
            "group": CATALOG[fid]["group"],
            "x": round(x, 6),
            "mask": mask,
            "weight": round(w, 6),
            "mask_weight": round(v, 6),
            "contribution": round(a * raw, 6),
        })

    final_logit = a * z + beta
    p = sigmoid(final_logit)
    intercept = a * b + beta
    sums = {g: 0.0 for g in GROUPS}
    for r in rows:
        sums[r["group"]] += r["contribution"]
    total_abs = sum(abs(v) for v in sums.values())
    groups = {
        g: {
            "sum": round(sums[g], 6),
            "pct": round(abs(sums[g]) / total_abs * 100, 3) if total_abs > 0 else 0.0,
            "direction": "fake" if sums[g] > 1e-9 else "real" if sums[g] < -1e-9 else "neutral",
        }
        for g in GROUPS
    }
    th = m.get("thresholds") or {"t_low": 0.3, "t_high": 0.7, "target_fpr": 0.05}
    t_low, t_high = finite(th.get("t_low"), 0.3), finite(th.get("t_high"), 0.7)
    used = sum(1 for r in rows if r["mask"] == 1.0)
    return {
        "probability": round(p, 6) if used > 0 else None,
        "verdict": verdict_for(p, t_low, t_high) if used > 0 else None,
        "calibrated": calibrated,
        "thresholds": {"t_low": t_low, "t_high": t_high, "target_fpr": finite(th.get("target_fpr"), 0.05), "calibrated": calibrated},
        "contributions": {
            "combo": combo,
            "intercept": round(intercept, 6),
            "logit": round(final_logit, 6),
            "temperature_a": a,
            "temperature_b": beta,
            "groups": groups,
            "per_indicator": rows,
        },
        "indicators_used": used,
    }


__all__ = ["fuse", "select_combo", "logit", "COMBOS"]
