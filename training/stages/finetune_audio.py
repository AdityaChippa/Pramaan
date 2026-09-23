"""Stage 5 — fine-tune AASIST-L (head only for `quick`) or keep the pretrained weights when no audio data exists."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from training.common import Context, device, download, roc_auc, write_json

log = logging.getLogger("pramaan.finetune_audio")


def pretrained_aasist(ctx: Context):
    p = ctx.cfg["pretrained"]["aasist_l"]
    w = download(p["url"], ctx.work / "pretrained" / "AASIST-L.pth", p["size"])
    c = download(p["config_url"], ctx.work / "pretrained" / "AASIST-L.conf")
    return w, c


def _evaluate(model, loader, dev):
    import torch

    model.eval()
    ys, ss = [], []
    with torch.no_grad():
        for x, t in loader:
            logits = model(x.to(dev), Freq_aug=False)[1].float()
            ss.append((logits[:, 0] - logits[:, 1]).cpu().numpy())  # spoof margin: higher = fake
            ys.append((t.numpy() == 0).astype(int))
    y = np.concatenate(ys) if ys else np.array([])
    s = np.concatenate(ss) if ss else np.array([])
    return roc_auc(y, s)


def finetune_audio(ctx: Context) -> dict[str, Any]:
    import torch
    from torch.utils.data import DataLoader

    from training.models import load_aasist_l
    from training.torch_data import AudioWindowDataset, stratified_cap

    out = ctx.stage_dir("finetune_audio")
    weights, conf = pretrained_aasist(ctx)
    items = [it for it in ctx.splits()["items"] if it["modality"] == "audio"] if "audio" in ctx.modalities else []
    train = [(it["path"], it["label"]) for it in items if it["split"] == "train"]
    val = [(it["path"], it["label"]) for it in items if it["split"] in ("val_a", "val_b")]
    if len({l for _, l in train}) < 2 or len({l for _, l in val}) < 2:
        return {"skipped": "audio for both classes required in train and validation — pretrained AASIST-L kept", "fine_tuned": False}

    dev = device()
    ab = ctx.b["audio"]
    if dev == "cpu":
        train = stratified_cap(train, int(ab["cpu_max_train_items"]), int(ctx.cfg["seed"]))
        val = stratified_cap(val, max(200, int(ab["cpu_max_train_items"]) // 3), int(ctx.cfg["seed"]))
    model = load_aasist_l(weights, conf, dev)
    if ab["train_head_only"]:
        for n, p in model.named_parameters():
            p.requires_grad = n.startswith("out_layer")
    tl = DataLoader(AudioWindowDataset(train, True), batch_size=int(ab["batch"]), shuffle=True, num_workers=0, drop_last=len(train) > int(ab["batch"]))
    vl = DataLoader(AudioWindowDataset(val, False), batch_size=int(ab["batch"]), shuffle=False, num_workers=0)
    base = _evaluate(model, vl, dev)
    best = {"epoch": 0, "val_auc": base}
    torch.save(model.state_dict(), out / "aasist_best.pth")
    opt = torch.optim.Adam([p for p in model.parameters() if p.requires_grad], lr=float(ab["lr"]), weight_decay=1e-4)
    # AASIST's official recipe weights bona fide higher because spoofed utterances dominate ASVspoof.
    n_real = sum(1 for _, l in train if l == 0)
    n_fake = len(train) - n_real
    lossf = torch.nn.CrossEntropyLoss(weight=torch.tensor([1.0, max(1.0, n_fake / max(1, n_real))], device=dev))
    history = []
    for ep in range(1, int(ab["epochs"]) + 1):
        model.train()
        losses = []
        for x, t in tl:
            opt.zero_grad(set_to_none=True)
            loss = lossf(model(x.to(dev), Freq_aug=True)[1], t.to(dev))
            loss.backward()
            opt.step()
            losses.append(float(loss))
        auc = _evaluate(model, vl, dev)
        history.append({"epoch": ep, "train_loss": float(np.mean(losses)) if losses else None, "val_auc": auc})
        log.info("epoch %d val AUC=%s", ep, auc)
        if auc is not None and (best["val_auc"] is None or auc > best["val_auc"]):
            best = {"epoch": ep, "val_auc": auc}
            torch.save(model.state_dict(), out / "aasist_best.pth")
    write_json(out / "history.json", {"pretrained_val_auc": base, "history": history, "best": best})
    return {"fine_tuned": best["epoch"] > 0, "best": best, "pretrained_val_auc": base, "train": len(train), "val": len(val), "device": dev}
