"""Stage 3 — fine-tune the DeepfakeBench EfficientNet-B4 face CNN; keep the best epoch by validation AUC."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from training.common import Context, device, download, roc_auc, write_json
from training.stages.extract import crop_items

log = logging.getLogger("pramaan.finetune_face")


def pretrained_face_weights(ctx: Context):
    p = ctx.cfg["pretrained"]["face_cnn"]
    return download(p["url"], ctx.work / "pretrained" / "effnb4_best.pth", p["size"])


def _evaluate(net, loader, dev) -> tuple[float | None, np.ndarray, np.ndarray]:
    import torch

    net.eval()
    ys, ss = [], []
    with torch.no_grad():
        for x, y in loader:
            logits = net(x.to(dev)).float()
            ss.append((logits[:, 1] - logits[:, 0]).cpu().numpy())
            ys.append(y.numpy())
    y = np.concatenate(ys) if ys else np.array([])
    s = np.concatenate(ss) if ss else np.array([])
    return roc_auc(y, s), y, s


def finetune_face(ctx: Context) -> dict[str, Any]:
    import torch
    from torch.utils.data import DataLoader

    from training.models.face_net import load_face_net, set_trainable_blocks
    from training.torch_data import FaceCropDataset, stratified_cap

    out = ctx.stage_dir("finetune_face")
    train = crop_items(ctx, ("train",))
    val = crop_items(ctx, ("val_a", "val_b"))
    if len({l for _, l in train}) < 2 or len({l for _, l in val}) < 2:
        return {"skipped": "face crops for both classes are required in train and validation", "fine_tuned": False}

    dev = device()
    fb = ctx.b["face"]
    cap = int(fb["max_train_crops"] if dev == "cuda" else fb["cpu_max_train_crops"])
    train = stratified_cap(train, cap, int(ctx.cfg["seed"]))
    val = stratified_cap(val, max(400, cap // 4), int(ctx.cfg["seed"]))
    log.info("device=%s train crops=%d val crops=%d", dev, len(train), len(val))

    net = load_face_net(pretrained_face_weights(ctx), dev)
    trainable = set_trainable_blocks(net, int(fb["trainable_blocks"]))
    workers = 0 if dev == "cpu" else 4
    tl = DataLoader(FaceCropDataset(train, True), batch_size=int(fb["batch"]), shuffle=True, num_workers=workers, drop_last=True)
    vl = DataLoader(FaceCropDataset(val, False), batch_size=int(fb["batch"]), shuffle=False, num_workers=workers)

    base_auc, _, _ = _evaluate(net, vl, dev)
    log.info("pretrained validation AUC=%s (trainable params %d)", base_auc, trainable)
    best = {"epoch": 0, "val_auc": base_auc}
    torch.save(net.state_dict(), out / "face_best.pth")

    opt = torch.optim.AdamW([p for p in net.parameters() if p.requires_grad], lr=float(fb["lr"]), weight_decay=1e-4)
    epochs = int(fb["epochs"])
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=float(fb["lr"]), total_steps=max(1, epochs * len(tl)))
    use_amp = dev == "cuda"
    scaler = torch.cuda.amp.GradScaler(enabled=use_amp)
    lossf = torch.nn.CrossEntropyLoss()
    history = []
    for ep in range(1, epochs + 1):
        net.train()
        # BatchNorm statistics of frozen blocks stay fixed.
        for m in net.modules():
            if isinstance(m, torch.nn.BatchNorm2d) and not any(p.requires_grad for p in m.parameters()):
                m.eval()
        losses = []
        for step, (x, y) in enumerate(tl):
            x, y = x.to(dev), y.to(dev)
            opt.zero_grad(set_to_none=True)
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                loss = lossf(net(x), y)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            losses.append(float(loss))
            if step % 50 == 0:
                log.info("epoch %d step %d/%d loss %.4f", ep, step, len(tl), float(np.mean(losses[-50:])))
        auc, _, _ = _evaluate(net, vl, dev)
        history.append({"epoch": ep, "train_loss": float(np.mean(losses)) if losses else None, "val_auc": auc})
        log.info("epoch %d val AUC=%s", ep, auc)
        if auc is not None and (best["val_auc"] is None or auc > best["val_auc"]):
            best = {"epoch": ep, "val_auc": auc}
            torch.save(net.state_dict(), out / "face_best.pth")
    write_json(out / "history.json", {"pretrained_val_auc": base_auc, "history": history, "best": best})
    return {"fine_tuned": best["epoch"] > 0, "best": best, "pretrained_val_auc": base_auc, "train_crops": len(train), "val_crops": len(val), "device": dev}
