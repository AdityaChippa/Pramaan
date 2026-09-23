"""Stage 9 — test-split metrics through the engine's own fuse(): AUC, EER, accuracy, precision/recall/F1,
confusion matrix at t_high, three-band coverage, ECE + reliability bins, per-combo and per-indicator AUC."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from training.common import Context, eer, read_json, roc_auc, write_json
from training.stages.handcrafted_features import load_rows
from training.stages.train_fusion import indicator_list, reliability

log = logging.getLogger("pramaan.evaluate")


def evaluate(ctx: Context) -> dict[str, Any]:
    from app.pipeline.fusion.model import fuse

    fusion = read_json(ctx.work / "export" / "fusion" / "fusion.json")
    if fusion is None:
        raise RuntimeError("fusion.json missing — run train_fusion first")
    cals = fusion.get("indicator_calibrators", {}) if fusion.get("calibrated") else {}
    rows = [r for r in load_rows(ctx) if r["split"] == "test" and "results" in r]
    if not rows:
        report = {"test_size": 0, "notes": "no test rows with features"}
        write_json(ctx.stage_dir("evaluate") / "evaluation.json", report)
        return report

    y, p, decided, verdicts, combos = [], [], [], [], []
    per_ind: dict[str, tuple[list[int], list[float]]] = {}
    for r in rows:
        inds = indicator_list(r, cals)
        res = fuse(inds, r["combo"], fusion)
        if res["probability"] is None:
            continue
        y.append(r["label"])
        p.append(res["probability"])
        verdicts.append(res["verdict"])
        decided.append(res["probability"] >= res["thresholds"]["t_high"])
        combos.append(r["combo"])
        for d in inds:
            if d["status"] == "ok" and d["score_0_1"] is not None:
                per_ind.setdefault(d["id"], ([], []))
                per_ind[d["id"]][0].append(r["label"])
                per_ind[d["id"]][1].append(d["score_0_1"])
    ya, pa, da = np.array(y), np.array(p), np.array(decided)
    tp = int(((da == 1) & (ya == 1)).sum())
    fp = int(((da == 1) & (ya == 0)).sum())
    tn = int(((da == 0) & (ya == 0)).sum())
    fn = int(((da == 0) & (ya == 1)).sum())
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else None
    bins, ece = reliability(pa, ya)
    per_combo = {}
    for c in sorted(set(combos)):
        m = np.array([x == c for x in combos])
        per_combo[c] = {"auc": roc_auc(ya[m], pa[m]), "eer": eer(ya[m], pa[m]), "n": int(m.sum())}
    report = {
        "auc": roc_auc(ya, pa), "eer": eer(ya, pa),
        "accuracy": float((da == ya).mean()) if len(ya) else None,
        "precision": precision, "recall": recall, "f1": f1,
        "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "verdict_bands": {v: int(sum(1 for x in verdicts if x == v)) for v in ("authentic", "inconclusive", "manipulated")},
        "ece": ece, "reliability": bins, "per_combo": per_combo,
        "per_indicator_auc": {k: {"auc": roc_auc(np.array(a), np.array(b)), "n": len(a)} for k, (a, b) in sorted(per_ind.items())},
        "test_size": int(len(ya)), "test_rows_without_score": int(len(rows) - len(ya)),
        "calibrated": bool(fusion.get("calibrated")), "trained_at": fusion.get("trained_at"),
        "notes": "Decision metrics use predicted fake ⇔ p ≥ t_high of the item's modality combo.",
    }
    write_json(ctx.stage_dir("evaluate") / "evaluation.json", report)
    log.info("test AUC=%s EER=%s n=%d", report["auc"], report["eer"], report["test_size"])
    return {k: report[k] for k in ("auc", "eer", "accuracy", "f1", "ece", "test_size")}
