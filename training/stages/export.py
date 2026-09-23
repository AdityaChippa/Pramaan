"""Stage 6 — ONNX export in the engine's folder layout; dynamic INT8 only where validated AUC drops < 1 pt.

Runs before handcrafted_features (see docs/DECISIONS.md) so fusion features are computed with exactly
the ONNX graphs the engine will serve."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from training.common import Context, read_json, roc_auc, write_json

log = logging.getLogger("pramaan.export")


# ── reusable builders (also used by backend/scripts/fetch_pretrained.py) ─────────────────────────────
def build_face_onnx(weights: Path, out_dir: Path, state_dict: Path | None = None) -> Path:
    import torch

    from training.models.face_net import FaceNetWithCAM, load_face_net
    from training.models.onnx_export import check_onnx, export_face

    net = load_face_net(weights, "cpu")
    if state_dict is not None:
        net.load_state_dict(torch.load(state_dict, map_location="cpu"))
    path = export_face(FaceNetWithCAM(net).eval(), out_dir / "face_cnn.onnx")
    check_onnx(path)
    return path


def build_clip_onnx(model_name: str, pretrained: str, out_dir: Path) -> Path:
    from training.models.onnx_export import check_onnx, export_clip_visual
    from training.models.univfd import ClipVisual, load_clip

    path = export_clip_visual(ClipVisual(load_clip(model_name, pretrained, "cpu")), out_dir / "clip_vitl14_visual.onnx")
    check_onnx(path)
    return path


def build_aasist_onnx(weights: Path, conf: Path, out_dir: Path, state_dict: Path | None = None) -> Path:
    import torch

    from training.models import load_aasist_l
    from training.models.onnx_export import check_onnx, export_aasist

    model = load_aasist_l(weights, conf, "cpu")
    if state_dict is not None:
        model.load_state_dict(torch.load(state_dict, map_location="cpu"))
    path = export_aasist(model, out_dir / "aasist_l.onnx")
    check_onnx(path)
    return path


# ── validation-gated quantisation ───────────────────────────────────────────────────────────────────
def _maybe_quantize(fp32: Path, score_fn, y: np.ndarray | None, max_drop: float) -> dict[str, Any]:
    from app.models.onnx_models import make_session
    from training.models.onnx_export import quantize_dynamic_int8

    if y is None or len(np.unique(y)) < 2:
        return {"quantized": False, "reason": "no labelled validation data to verify an INT8 graph — FP32 kept"}
    int8 = fp32.with_name(fp32.stem + ".int8.onnx")
    quantize_dynamic_int8(fp32, int8)
    auc32 = roc_auc(y, score_fn(make_session(fp32)))
    auc8 = roc_auc(y, score_fn(make_session(int8)))
    info = {"fp32_val_auc": auc32, "int8_val_auc": auc8, "fp32_mb": round(fp32.stat().st_size / 1e6, 1), "int8_mb": round(int8.stat().st_size / 1e6, 1)}
    if auc32 is not None and auc8 is not None and auc32 - auc8 < max_drop:
        shutil.move(str(int8), str(fp32))
        info["quantized"] = True
    else:
        int8.unlink(missing_ok=True)
        info["quantized"] = False
        info["reason"] = f"AUC drop ≥ {max_drop}"
    log.info("%s quantisation: %s", fp32.name, info)
    return info


def export(ctx: Context) -> dict[str, Any]:
    from app.models.onnx_models import AASIST, FaceCNN, UnivFD, clip_tensor, preprocess_clip
    from training.stages.extract import crop_items
    from training.stages.finetune_audio import pretrained_aasist
    from training.stages.finetune_face import pretrained_face_weights
    from training.torch_data import stratified_cap

    out = ctx.stage_dir("export")
    max_drop = float(ctx.b["quantize_max_auc_drop"])
    seed = int(ctx.cfg["seed"])
    report: dict[str, Any] = {}
    split_items = ctx.splits()["items"]

    if {"image", "video"} & set(ctx.modalities):
        d = out / "face_cnn"
        d.mkdir(parents=True, exist_ok=True)
        ft = ctx.work / "finetune_face" / "face_best.pth"
        tuned = bool(ctx.summary("finetune_face").get("fine_tuned")) and ft.exists()
        fp32 = build_face_onnx(pretrained_face_weights(ctx), d, ft if tuned else None)
        val = stratified_cap(crop_items(ctx, ("val_a", "val_b")), 600, seed)
        crops = [cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB) for p, _ in val]
        y = np.array([l for _, l in val]) if val else None

        def face_scores(sess):
            logits, _ = FaceCNN(sess, "eval").predict(crops)
            return logits[:, 1] - logits[:, 0]

        report["face_cnn"] = {"fine_tuned": tuned, **_maybe_quantize(fp32, face_scores, y, max_drop)}

    if "image" in ctx.modalities:
        d = out / "univfd"
        d.mkdir(parents=True, exist_ok=True)
        pc = ctx.cfg["pretrained"]["clip"]
        fp32 = d / "clip_vitl14_visual.onnx"
        if not fp32.exists():
            build_clip_onnx(pc["open_clip_model"], pc["open_clip_pretrained"], d)
        probe = read_json(ctx.work / "train_univfd_probe" / "probe.json")
        write_json(d / "probe.json", probe)
        val = [it for it in split_items if it["modality"] == "image" and it["split"] in ("val_a", "val_b")][:400]
        from app.pipeline.analyze_local import load_image_bgr

        imgs = np.stack([preprocess_clip(cv2.cvtColor(load_image_bgr(it["path"]), cv2.COLOR_BGR2RGB)) for it in val]) if val else None
        y = np.array([it["label"] for it in val]) if val else None

        def clip_scores(sess):
            return UnivFD(sess, probe, "eval").logits(UnivFD(sess, probe, "eval").embed(imgs))

        report["univfd"] = {"probe_trained": bool(ctx.summary("train_univfd_probe").get("trained")), **_maybe_quantize(fp32, clip_scores, y, max_drop)}
        _ = clip_tensor  # CLIP normalisation is applied inside UnivFD.embed (shared with the engine)

    if "audio" in ctx.modalities:
        d = out / "aasist"
        d.mkdir(parents=True, exist_ok=True)
        weights, conf = pretrained_aasist(ctx)
        ft = ctx.work / "finetune_audio" / "aasist_best.pth"
        tuned = bool(ctx.summary("finetune_audio").get("fine_tuned")) and ft.exists()
        fp32 = build_aasist_onnx(weights, conf, d, ft if tuned else None)
        val = [it for it in split_items if it["modality"] == "audio" and it["split"] in ("val_a", "val_b")][:300]
        from app.pipeline.media import decode_audio

        wavs = []
        for it in val:
            try:
                wavs.append((decode_audio(it["path"], 16000, 30.0)[0], it["label"]))
            except Exception as exc:  # noqa: BLE001
                log.warning("skip %s: %s", it["path"], exc)
        y = np.array([l for _, l in wavs]) if wavs else None

        def audio_scores(sess):
            m = AASIST(sess, "eval")
            return np.array([np.mean([s for _, s in m.spoof_logits(w)]) for w, _ in wavs])

        report["aasist"] = {"fine_tuned": tuned, **_maybe_quantize(fp32, audio_scores, y, max_drop)}

    write_json(out / "export_report.json", report)
    return report
