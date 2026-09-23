"""Stage 1 — scan the dataset contract, hash, dedupe, group-aware stratified 70/15/15 split (val → val_a/val_b)."""
from __future__ import annotations

import logging
import random
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from training.common import LABELS, MEDIA_EXT, Context, sha256_file, write_json

log = logging.getLogger("pramaan.prepare")


def _group_for(path: Path, label_root: Path) -> str:
    """Identity/source grouping so the same person or source video never spans splits.
    Nested layout → first sub-folder(s); flat FF++/Celeb-DF style names (id0_id16_0000.mp4, 000_003.mp4) → leading id."""
    rel = path.relative_to(label_root)
    if len(rel.parts) >= 3:
        return "/".join(rel.parts[:2])
    stem = path.stem
    m = re.match(r"^(id\d+)", stem) or re.match(r"^(\d{3})_\d{3}", stem) or re.match(r"^([A-Za-z]+[_-]?\d+)", stem)
    prefix = rel.parts[0] if len(rel.parts) == 2 else ""
    return f"{prefix}/{m.group(1) if m else stem}"


def _scan_contract(root: Path, modality: str) -> list[dict[str, Any]]:
    items = []
    for lab in ("real", "fake"):
        base = root / modality / lab
        if not base.exists():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_file() and p.suffix.lower() in MEDIA_EXT[modality]:
                items.append({"path": str(p.resolve()), "modality": modality, "label": LABELS[lab], "group": f"{lab}:{_group_for(p, base)}", "source": "contract"})
    return items


def _scan_asvspoof(root: Path) -> list[dict[str, Any]]:
    base = root / "audio" / "asvspoof2019_la"
    proto_dir = base / "ASVspoof2019_LA_cm_protocols"
    if not proto_dir.exists():
        return []
    items = []
    for part, fname in (("train", "ASVspoof2019.LA.cm.train.trn.txt"), ("dev", "ASVspoof2019.LA.cm.dev.trl.txt"), ("eval", "ASVspoof2019.LA.cm.eval.trl.txt")):
        proto = proto_dir / fname
        flac_dir = base / f"ASVspoof2019_LA_{part}" / "flac"
        if not proto.exists() or not flac_dir.exists():
            continue
        for line in proto.read_text().splitlines():
            cols = line.split()
            if len(cols) < 5:
                continue
            speaker, utt, system, key = cols[0], cols[1], cols[3], cols[4]
            f = flac_dir / f"{utt}.flac"
            if f.exists():
                items.append({"path": str(f.resolve()), "modality": "audio", "label": 0 if key == "bonafide" else 1,
                              "group": f"asv:{speaker}", "source": f"asvspoof2019_la/{part}/{system}"})
    log.info("ASVspoof 2019 LA: %d utterances from official protocols", len(items))
    return items


def _split_groups(items: list[dict[str, Any]], cfg: dict[str, Any], seed: int) -> None:
    """Assigns splits per label so each split keeps the class balance, with whole groups moved together."""
    rng = random.Random(seed)
    for label in (0, 1):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for it in items:
            if it["label"] == label:
                groups[it["group"]].append(it)
        keys = sorted(groups)
        rng.shuffle(keys)
        total = sum(len(groups[k]) for k in keys)
        targets = {"train": cfg["train"] * total, "val": cfg["val"] * total}
        counts = {"train": 0, "val_a": 0, "val_b": 0, "test": 0}
        for k in keys:
            n = len(groups[k])
            if counts["train"] + n <= targets["train"] or counts["train"] == 0:
                split = "train"
            elif counts["val_a"] + counts["val_b"] + n <= targets["val"] or counts["val_a"] + counts["val_b"] == 0:
                split = "val_a" if counts["val_a"] <= counts["val_b"] else "val_b"
            else:
                split = "test"
            counts[split] += n
            for it in groups[k]:
                it["split"] = split


def prepare(ctx: Context) -> dict[str, Any]:
    out = ctx.stage_dir("prepare")
    seed = int(ctx.cfg["seed"])
    all_items: list[dict[str, Any]] = []
    for m in ctx.modalities:
        found = _scan_contract(ctx.data, m)
        if m == "audio":
            found += _scan_asvspoof(ctx.data)
        log.info("%s: %d candidate files", m, len(found))
        all_items += found

    seen: dict[str, dict[str, Any]] = {}
    dup = conflicts = 0
    for i, it in enumerate(all_items):
        h = sha256_file(Path(it["path"]))
        if h in seen:
            dup += 1
            if seen[h]["label"] != it["label"]:
                conflicts += 1
                seen[h]["conflict"] = True
            continue
        it["sha256"] = h
        seen[h] = it
        if (i + 1) % 2000 == 0:
            log.info("hashed %d/%d", i + 1, len(all_items))
    items = [it for it in seen.values() if not it.get("conflict")]

    cap = int(ctx.b["max_items_per_class"])
    rng = random.Random(seed)
    capped = []
    for m in ctx.modalities:
        for lab in (0, 1):
            pool = [it for it in items if it["modality"] == m and it["label"] == lab]
            rng.shuffle(pool)
            capped += pool[:cap]
    for m in ctx.modalities:
        _split_groups([it for it in capped if it["modality"] == m], ctx.cfg["split"], seed)

    stats: dict[str, Any] = {}
    for m in ctx.modalities:
        stats[m] = {s: {"real": sum(1 for it in capped if it["modality"] == m and it["split"] == s and it["label"] == 0),
                        "fake": sum(1 for it in capped if it["modality"] == m and it["split"] == s and it["label"] == 1)}
                    for s in ("train", "val_a", "val_b", "test")}
        stats[m]["groups"] = len({it["group"] for it in capped if it["modality"] == m})
    write_json(out / "splits.json", {"seed": seed, "items": capped, "stats": stats,
                                     "dedupe": {"duplicates_removed": dup, "label_conflicts_dropped": conflicts}})
    log.info("split stats: %s", stats)
    return {"items": len(capped), "stats": stats, "duplicates": dup, "label_conflicts": conflicts}
