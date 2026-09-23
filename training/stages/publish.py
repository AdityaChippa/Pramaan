"""Stage 10 — upload changed model folders to Storage `models/<name>/<version>/` (chunked + manifest),
insert model_registry rows with metrics/dataset stats/config, activate the new versions, ping the engine."""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from typing import Any

from training.common import Context, read_json, supabase_client

log = logging.getLogger("pramaan.publish")


def _metrics_for(ind_id: str, evaluation: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    per = (evaluation.get("per_indicator_auc") or {}).get(ind_id) or {}
    m = {"auc": per.get("auc"), "test_items_with_score": per.get("n"), "trained_at": evaluation.get("trained_at"), **extra}
    return {k: v for k, v in m.items() if v is not None}


def _ping_engine() -> None:
    url, secret = os.environ.get("ENGINE_URL"), os.environ.get("ENGINE_SHARED_SECRET")
    if not url or not secret:
        log.info("ENGINE_URL/ENGINE_SHARED_SECRET not set — the engine picks up new versions within 10 minutes")
        return
    try:
        req = urllib.request.Request(url.rstrip("/") + "/models/reload", method="POST", headers={"x-engine-secret": secret})
        with urllib.request.urlopen(req, timeout=20) as r:
            log.info("engine reload requested: HTTP %s", r.status)
    except Exception as exc:  # noqa: BLE001
        log.warning("engine reload ping failed (%s); it will reload on its 10-minute registry check", exc)


def publish(ctx: Context) -> dict[str, Any]:
    from app.models.registry import publish_model

    client = supabase_client()
    version = ctx.cfg.get("version") or time.strftime("%Y%m%d-%H%M", time.gmtime())
    chunk_mb = float(ctx.cfg["publish"]["chunk_mb"])
    exp = ctx.work / "export"
    evaluation = read_json(ctx.work / "evaluate" / "evaluation.json", {}) or {}
    splits = ctx.splits()
    dataset_stats = {"splits": splits["stats"], "dedupe": splits["dedupe"],
                     "sources": sorted({it["source"].split("/")[0] for it in splits["items"]})}
    exp_report = read_json(exp / "export_report.json", {}) or {}
    base_config = {"budget": ctx.budget, "modalities": ctx.modalities, "seed": ctx.cfg["seed"], "split": ctx.cfg["split"],
                   "target_fpr": ctx.cfg["target_fpr"], "budget_params": ctx.b}
    published = []

    face = ctx.summary("finetune_face")
    if face.get("fine_tuned") and (exp / "face_cnn" / "face_cnn.onnx").exists():
        publish_model(client, name="face_cnn", version=version, modality="image", files=[exp / "face_cnn" / "face_cnn.onnx"], fmt="onnx",
                      metrics=_metrics_for("face_cnn", evaluation, {"val_auc": face["best"]["val_auc"], "pretrained_val_auc": face.get("pretrained_val_auc"),
                                                                    "export": exp_report.get("face_cnn")}),
                      dataset_stats=dataset_stats, config={**base_config, "stage": face}, calibrated=False, chunk_mb=chunk_mb, log=log.info)
        published.append("face_cnn")
    uni = ctx.summary("train_univfd_probe")
    if uni.get("trained") and (exp / "univfd" / "probe.json").exists():
        publish_model(client, name="univfd", version=version, modality="image",
                      files=[exp / "univfd" / "clip_vitl14_visual.onnx", exp / "univfd" / "probe.json"], fmt="onnx+json",
                      metrics=_metrics_for("univfd", evaluation, {"val_auc": uni.get("val_auc"), "pretrained_val_auc": uni.get("pretrained_val_auc"),
                                                                  "export": exp_report.get("univfd")}),
                      dataset_stats=dataset_stats, config={**base_config, "stage": uni}, calibrated=False, chunk_mb=chunk_mb, log=log.info)
        published.append("univfd")
    aud = ctx.summary("finetune_audio")
    if aud.get("fine_tuned") and (exp / "aasist" / "aasist_l.onnx").exists():
        publish_model(client, name="aasist", version=version, modality="audio", files=[exp / "aasist" / "aasist_l.onnx"], fmt="onnx",
                      metrics=_metrics_for("aasist", evaluation, {"val_auc": aud["best"]["val_auc"], "pretrained_val_auc": aud.get("pretrained_val_auc"),
                                                                  "export": exp_report.get("aasist")}),
                      dataset_stats=dataset_stats, config={**base_config, "stage": aud}, calibrated=False, chunk_mb=chunk_mb, log=log.info)
        published.append("aasist")

    fusion_path = exp / "fusion" / "fusion.json"
    fusion = json.loads(fusion_path.read_text(encoding="utf-8")) if fusion_path.exists() else None
    if fusion and fusion.get("calibrated"):
        trained = {k: v for k, v in fusion["combos"].items() if v.get("calibrated")}
        main = max(trained, key=lambda k: trained[k].get("training", {}).get("val_b", 0))
        metrics = dict(evaluation)
        combo_summary = {k: {"calibrated": bool(v.get("calibrated")), "thresholds": v.get("thresholds"),
                             **{kk: vv for kk, vv in v.get("training", {}).items() if kk != "reliability_val_b"}}
                         for k, v in fusion["combos"].items()}
        publish_model(client, name="fusion", version=version, modality="multimodal", files=[fusion_path], fmt="json",
                      metrics=metrics, dataset_stats=dataset_stats,
                      config={**base_config, "combo_training": combo_summary, "thresholds_shown_for_combo": main},
                      thresholds=trained[main]["thresholds"], calibrated=True, chunk_mb=chunk_mb, log=log.info)
        published.append("fusion")
    else:
        log.warning("fusion is not calibrated (insufficient data) — not published; the engine keeps the current fusion version")

    if published:
        _ping_engine()
    return {"version": version, "published": published}
