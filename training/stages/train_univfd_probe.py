"""Stage 4 — cache CLIP ViT-L/14 embeddings once, then fit the UnivFD logistic probe (C chosen on validation)."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from training.common import Context, device, download, roc_auc, write_json

log = logging.getLogger("pramaan.univfd")


def _embed_items(ctx: Context, items: list[dict[str, Any]], cache_path) -> dict[str, np.ndarray]:
    import cv2
    import torch

    from app.models.onnx_models import clip_tensor, preprocess_clip
    from app.pipeline.analyze_local import load_image_bgr
    from training.models.univfd import load_clip

    cache: dict[str, np.ndarray] = {}
    if cache_path.exists():
        z = np.load(cache_path)
        cache = {k: z[k] for k in z.files}
    todo = [it for it in items if it["sha256"] not in cache]
    if not todo:
        return cache
    dev = device()
    pc = ctx.cfg["pretrained"]["clip"]
    model = load_clip(pc["open_clip_model"], pc["open_clip_pretrained"], dev)
    batch, keys = [], []

    def flush():
        if not batch:
            return
        with torch.no_grad():
            emb = model.visual(torch.from_numpy(clip_tensor(np.stack(batch))).to(dev)).float().cpu().numpy()
        for k, e in zip(keys, emb):
            cache[k] = e
        batch.clear()
        keys.clear()

    for i, it in enumerate(todo):
        try:
            img = load_image_bgr(it["path"])  # same decoder and CLIP transform as the engine
            batch.append(preprocess_clip(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
            keys.append(it["sha256"])
        except Exception as exc:  # noqa: BLE001
            log.warning("skip %s: %s", it["path"], exc)
        if len(batch) == 32:
            flush()
        if (i + 1) % 500 == 0:
            flush()
            np.savez(cache_path, **cache)
            log.info("embedded %d/%d", i + 1, len(todo))
    flush()
    np.savez(cache_path, **cache)
    return cache


def train_univfd_probe(ctx: Context) -> dict[str, Any]:
    from sklearn.linear_model import LogisticRegression

    from training.models.univfd import probe_from_pth

    out = ctx.stage_dir("train_univfd_probe")
    p = ctx.cfg["pretrained"]["univfd_probe"]
    pretrained_probe = probe_from_pth(download(p["url"], ctx.work / "pretrained" / "fc_weights.pth", p["size"]))
    items = [it for it in ctx.splits()["items"] if it["modality"] == "image"][: int(ctx.b["univfd"]["max_images"])]
    train = [it for it in items if it["split"] == "train"]
    val = [it for it in items if it["split"] in ("val_a", "val_b")]
    if "image" not in ctx.modalities or len({it["label"] for it in train}) < 2 or len({it["label"] for it in val}) < 2:
        write_json(out / "probe.json", pretrained_probe)
        return {"skipped": "image data for both classes required in train and validation", "trained": False}

    emb = _embed_items(ctx, train + val, out / "embeddings.npz")
    def xy(rows):
        rows = [r for r in rows if r["sha256"] in emb]
        return np.stack([emb[r["sha256"]] for r in rows]), np.array([r["label"] for r in rows])
    Xtr, ytr = xy(train)
    Xva, yva = xy(val)
    pre_auc = roc_auc(yva, Xva @ np.asarray(pretrained_probe["w"]) + pretrained_probe["b"])
    best = {"C": None, "val_auc": pre_auc, "probe": pretrained_probe}
    for C in ctx.b["fusion"]["C_grid"]:
        clf = LogisticRegression(C=float(C), max_iter=5000)
        clf.fit(Xtr, ytr)
        auc = roc_auc(yva, clf.decision_function(Xva))
        log.info("C=%s val AUC=%s", C, auc)
        if auc is not None and (best["val_auc"] is None or auc > best["val_auc"]):
            best = {"C": float(C), "val_auc": auc, "probe": {"w": clf.coef_[0].astype(float).tolist(), "b": float(clf.intercept_[0]), "source": f"trained logistic probe C={C}"}}
    write_json(out / "probe.json", best["probe"])
    return {"trained": best["C"] is not None, "C": best["C"], "val_auc": best["val_auc"], "pretrained_val_auc": pre_auc, "train": len(ytr), "val": len(yva)}
