"""Stage 7 — run the engine's own analyze_file() (all indicators, exported ONNX models) on val_a, val_b and test."""
from __future__ import annotations

import json
import logging
import random
from typing import Any

from training.common import Context

log = logging.getLogger("pramaan.features")
SPLITS = ("val_a", "val_b", "test")


def load_rows(ctx: Context) -> list[dict[str, Any]]:
    path = ctx.work / "handcrafted_features" / "features.jsonl"
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def handcrafted_features(ctx: Context) -> dict[str, Any]:
    from app.config import AnalysisSettings
    from app.models.loader import LocalModelProvider
    from app.pipeline.analyze_local import analyze_file

    out = ctx.stage_dir("handcrafted_features")
    path = out / "features.jsonl"
    done = {r["sha256"] for r in load_rows(ctx)}
    provider = LocalModelProvider(ctx.work / "export", version="training-candidate")
    if provider.errors:
        log.warning("model load errors (those indicators will be not_applicable): %s", provider.errors)
    settings = AnalysisSettings()
    cap = int(ctx.b["features"]["max_items_per_split"])
    rng = random.Random(int(ctx.cfg["seed"]))
    todo = []
    for m in ctx.modalities:
        for s in SPLITS:
            pool = [it for it in ctx.splits()["items"] if it["modality"] == m and it["split"] == s]
            rng.shuffle(pool)
            todo += pool[:cap]
    errors = 0
    with path.open("a", encoding="utf-8") as fh:
        for i, it in enumerate(todo):
            if it["sha256"] in done:
                continue
            row: dict[str, Any] = {k: it[k] for k in ("sha256", "label", "split", "modality", "path")}
            try:
                res = analyze_file(it["path"], provider=provider, settings=settings, media_type=it["modality"])
                row.update({"combo": res.combo, "has_audio": bool(res.meta.get("has_audio")),
                            "results": {r.id: {"status": r.status, "value": r.value, "features": r.features} for r in res.results}})
            except Exception as exc:  # noqa: BLE001
                errors += 1
                row["error"] = f"{type(exc).__name__}: {exc}"[:500]
                log.warning("analysis failed for %s: %s", it["path"], row["error"])
            fh.write(json.dumps(row, default=float) + "\n")
            fh.flush()
            if (i + 1) % 25 == 0:
                log.info("features %d/%d", i + 1, len(todo))
    rows = load_rows(ctx)
    return {"rows": len(rows), "errors": errors, "per_split": {s: sum(1 for r in rows if r["split"] == s and "results" in r) for s in SPLITS},
            "model_errors": provider.errors}
