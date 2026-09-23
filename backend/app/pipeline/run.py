"""Case orchestration (§5.5): ingest & hash → metadata → routing → detectors → fusion → artifacts → finalize."""
from __future__ import annotations

import datetime as dt
import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.models.loader import get_provider
from app.pipeline.analyze_local import analyze_file
from app.pipeline.artifacts import upload_bag
from app.pipeline.events import EventReporter
from app.pipeline.fusion.model import fuse
from app.pipeline.scoring import to_indicator_dict
from app.pipeline.types import clean_json
from app.supabase_io import SupabaseIO, now_iso

log = logging.getLogger("pramaan.run")
MEDIA_BUCKET = "media-uploads"


def _wait_for_models(provider: Any, timeout_s: float = 900) -> None:
    t0 = time.time()
    while provider.loading and time.time() - t0 < timeout_s:
        time.sleep(1.0)


def process_case(case_id: str) -> None:
    settings = get_settings()
    io = SupabaseIO()
    case = io.get_case(case_id)
    if case is None:
        log.warning("case %s not found", case_id)
        return
    if case["status"] == "complete":
        return
    rep = EventReporter(io, case_id)
    provider = get_provider()
    tmp = Path(tempfile.mkdtemp(prefix=f"case_{case_id[:8]}_"))
    io.update_case(case_id, {"status": "processing", "error": None})
    try:
        with rep.step("ingest", bucket=MEDIA_BUCKET, path=case["file_path"], source=case["source"]) as d:
            if not case.get("file_path"):
                raise ValueError("case has no file_path")
            data = io.download(MEDIA_BUCKET, case["file_path"])
            if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
                raise ValueError(f"file exceeds MAX_UPLOAD_MB={settings.MAX_UPLOAD_MB}")
            suffix = Path(case.get("filename") or case["file_path"]).suffix or ""
            local = tmp / f"input{suffix}"
            local.write_bytes(data)
            d.update({"bytes": len(data), "received_at": now_iso()})
            _wait_for_models(provider)
            d["model_versions"] = dict(provider.versions)

        prior = io.user_phashes(case["user_id"], case_id)
        out = analyze_file(local, provider=provider, settings=settings, media_type=case["media_type"],
                           mime=case.get("mime_type"), reporter=rep, prior_hashes=prior,
                           client_sha256=case.get("client_sha256"))

        with rep.step("fusion", combo=out.combo) as d:
            indicators = [to_indicator_dict(r, provider.fusion) for r in out.results]
            fused = fuse(indicators, out.combo, provider.fusion)
            d.update({"probability": fused["probability"], "verdict": fused["verdict"], "calibrated": fused["calibrated"],
                      "indicators_used": fused["indicators_used"], "logit": fused["contributions"]["logit"]})

        with rep.step("artifacts_upload", bucket="overlays") as d:
            artifacts = upload_bag(io, out.bag, case["user_id"], case_id, indicators)
            d.update({"files": len(out.bag.images) + (1 if out.bag.thumbnail is not None else 0)})

        with rep.step("finalize") as d:
            fields = clean_json({
                "status": "complete" if fused["probability"] is not None else "failed",
                "error": None if fused["probability"] is not None else "No indicator produced a usable score — nothing to fuse",
                "sha256": out.meta["sha256"],
                "phash": out.meta.get("phash"),
                "file_size": out.meta["file_size"],
                "duration_s": out.meta.get("duration_s"),
                "verdict": fused["verdict"],
                "probability": fused["probability"],
                "calibrated": fused["calibrated"],
                "thresholds": fused["thresholds"],
                "modality_contributions": fused["contributions"],
                "indicators": indicators,
                "artifacts": artifacts,
                "model_versions": {**provider.versions, "engine_errors": provider.errors} if provider.errors else dict(provider.versions),
                "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            })
            d.update({"sha256": out.meta["sha256"], "verdict": fused["verdict"]})
            io.update_case(case_id, fields)
    except Exception as exc:  # noqa: BLE001 — the case is marked failed with the reason
        log.exception("case %s failed", case_id)
        io.update_case(case_id, {"status": "failed", "error": f"{type(exc).__name__}: {exc}"[:1000]})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def pending_case_ids(io: SupabaseIO, max_age_hours: float = 24) -> list[str]:
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=max_age_hours)).isoformat()
    r = (io.c.table("cases").select("id").in_("status", ["queued", "processing"]).not_.is_("file_path", "null")
         .gte("created_at", since).order("created_at").limit(50).execute())
    return [row["id"] for row in (r.data or [])]
