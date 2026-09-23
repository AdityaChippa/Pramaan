"""Stage 8 — indicator calibrators + per-combo L2 logistic fusion on val_a; Platt scaling, verdict thresholds
and reliability data on val_b. Output uses the engine's fusion.json format (pramaan-fusion-v1)."""
from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np

from training.common import Context, roc_auc, write_json
from training.stages.handcrafted_features import load_rows

log = logging.getLogger("pramaan.fusion")
MIN_ROWS = 30
MIN_PER_CLASS = 8


def _best_C(X: np.ndarray, y: np.ndarray, grid: list[float], seed: int) -> float:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score

    k = int(min(5, np.bincount(y).min()))
    if k < 2:
        return 1.0
    cv = StratifiedKFold(n_splits=k, shuffle=True, random_state=seed)
    scores = {C: float(np.mean(cross_val_score(LogisticRegression(C=C, max_iter=5000), X, y, cv=cv, scoring="roc_auc"))) for C in grid}
    return max(scores, key=scores.get)


def fit_indicator_calibrators(rows: list[dict[str, Any]], grid: list[float], seed: int) -> tuple[dict[str, Any], dict[str, Any]]:
    from sklearn.linear_model import LogisticRegression

    from app.pipeline.scoring import DEFAULT_CALIBRATORS

    cals, report = {}, {}
    for ind_id in DEFAULT_CALIBRATORS:
        ok = [r for r in rows if r["results"].get(ind_id, {}).get("status") == "ok"]
        y = np.array([r["label"] for r in ok], int)
        if len(ok) < MIN_ROWS or len(np.unique(y)) < 2 or np.bincount(y).min() < MIN_PER_CLASS:
            report[ind_id] = {"trained": False, "n": len(ok)}
            continue
        names = sorted({k for r in ok for k in r["results"][ind_id]["features"]})
        names = [n for n in names if sum(1 for r in ok if n in r["results"][ind_id]["features"]) >= 0.5 * len(ok)]
        if not names:
            report[ind_id] = {"trained": False, "n": len(ok), "reason": "no consistently present features"}
            continue
        raw = np.array([[float(r["results"][ind_id]["features"].get(n, np.nan)) for n in names] for r in ok])
        raw[~np.isfinite(raw)] = np.nan
        center = np.nanmean(raw, axis=0)
        scale = np.nanstd(raw, axis=0)
        scale[~np.isfinite(scale) | (scale < 1e-9)] = 1.0
        X = np.where(np.isnan(raw), 0.0, (raw - center) / scale)  # missing → centre, exactly as apply_calibrator skips it
        C = _best_C(X, y, grid, seed)
        clf = LogisticRegression(C=C, max_iter=5000).fit(X, y)
        cals[ind_id] = {"bias": float(clf.intercept_[0]),
                        "features": {n: {"weight": float(w), "center": float(c), "scale": float(s)} for n, w, c, s in zip(names, clf.coef_[0], center, scale)}}
        report[ind_id] = {"trained": True, "n": len(ok), "C": C, "val_a_auc": roc_auc(y, clf.decision_function(X))}
    return cals, report


def indicator_list(row: dict[str, Any], cals: dict[str, Any]) -> list[dict[str, Any]]:
    """Mirror of backend scoring.to_indicator_dict for stored features (trained calibrator, else default)."""
    from app.pipeline.scoring import DEFAULT_CALIBRATORS, apply_calibrator

    out = []
    for ind_id, r in row["results"].items():
        cal = cals.get(ind_id) or DEFAULT_CALIBRATORS.get(ind_id)
        score = apply_calibrator(r["features"], cal) if r["status"] == "ok" and cal is not None else None
        out.append({"id": ind_id, "status": r["status"], "score_0_1": score})
    return out


def combos_for(row: dict[str, Any]) -> list[str]:
    c = [row["combo"]]
    if row["combo"] in ("video", "video_audio"):
        c.append("live")
    return c


def _design(rows, feats, cals, x_clip):
    from app.pipeline.fusion.model import logit

    X = np.zeros((len(rows), 2 * len(feats)))
    for i, row in enumerate(rows):
        by = {d["id"]: d for d in indicator_list(row, cals)}
        for j, f in enumerate(feats):
            d = by.get(f)
            if d and d["status"] == "ok" and d["score_0_1"] is not None:
                X[i, j] = max(-x_clip, min(x_clip, logit(float(d["score_0_1"]))))
                X[i, len(feats) + j] = 1.0
    return X


def choose_thresholds(p: np.ndarray, y: np.ndarray, target: float) -> dict[str, float]:
    real, fake = p[y == 0], p[y == 1]
    cand_hi = np.unique(np.concatenate([real, [1.0]]))
    t_high = float(next(t for t in cand_hi if np.mean(real >= t) <= target))
    cand_lo = np.unique(np.concatenate([[0.0], fake]))[::-1]
    t_low = float(next(t for t in cand_lo if np.mean(fake <= t) <= target))
    t_high = min(0.99, max(0.01, t_high))
    t_low = min(0.99, max(0.01, t_low))
    if t_low > t_high:
        t_low = t_high = round((t_low + t_high) / 2, 6)
    return {"t_low": round(t_low, 6), "t_high": round(t_high, 6), "target_fpr": target}


def reliability(p: np.ndarray, y: np.ndarray, bins: int = 10) -> tuple[list[dict[str, Any]], float]:
    edges = np.linspace(0, 1, bins + 1)
    out, ece = [], 0.0
    for i in range(bins):
        m = (p >= edges[i]) & ((p < edges[i + 1]) if i < bins - 1 else (p <= 1))
        n = int(m.sum())
        mp = float(p[m].mean()) if n else None
        fp = float(y[m].mean()) if n else None
        if n:
            ece += n / len(p) * abs(mp - fp)
        out.append({"bin_lo": float(edges[i]), "bin_hi": float(edges[i + 1]), "mean_pred": mp, "frac_pos": fp, "count": n})
    return out, float(ece)


def train_fusion(ctx: Context) -> dict[str, Any]:
    from sklearn.linear_model import LogisticRegression

    from app.pipeline.fusion.defaults import COMBOS, default_fusion_config

    grid = [float(c) for c in ctx.b["fusion"]["C_grid"]]
    seed = int(ctx.cfg["seed"])
    target = float(ctx.cfg["target_fpr"])
    rows = [r for r in load_rows(ctx) if "results" in r]
    val_a = [r for r in rows if r["split"] == "val_a"]
    val_b = [r for r in rows if r["split"] == "val_b"]
    cfg = default_fusion_config()
    x_clip = float(cfg["x_clip"])

    cals, cal_report = fit_indicator_calibrators(val_a, grid, seed)
    combo_report: dict[str, Any] = {}
    for combo, feats in COMBOS.items():
        entry = cfg["combos"][combo]
        entry["calibrated"] = False
        ra = [r for r in val_a if combo in combos_for(r)]
        rb = [r for r in val_b if combo in combos_for(r)]
        ya = np.array([r["label"] for r in ra], int)
        yb = np.array([r["label"] for r in rb], int)
        if len(ra) < MIN_ROWS or len(np.unique(ya)) < 2 or np.bincount(ya).min() < MIN_PER_CLASS or len(np.unique(yb)) < 2:
            combo_report[combo] = {"trained": False, "val_a": len(ra), "val_b": len(rb), "reason": "insufficient labelled rows — documented defaults kept"}
            continue
        Xa = _design(ra, feats, cals, x_clip)
        C = _best_C(Xa, ya, grid, seed)
        lr = LogisticRegression(C=C, max_iter=5000).fit(Xa, ya)
        w = lr.coef_[0]
        entry["weights"] = {f: float(w[j]) for j, f in enumerate(feats)}
        entry["mask_weights"] = {f: float(w[len(feats) + j]) for j, f in enumerate(feats)}
        entry["intercept"] = float(lr.intercept_[0])
        Xb = _design(rb, feats, cals, x_clip)
        zb = Xb @ w + lr.intercept_[0]
        platt = LogisticRegression(C=1e6, max_iter=5000).fit(zb.reshape(-1, 1), yb)
        entry["temperature_a"] = float(platt.coef_[0][0])
        entry["temperature_b"] = float(platt.intercept_[0])
        pb = 1 / (1 + np.exp(-(entry["temperature_a"] * zb + entry["temperature_b"])))
        entry["thresholds"] = choose_thresholds(pb, yb, target)
        bins, ece = reliability(pb, yb)
        entry["calibrated"] = True
        entry["training"] = {"C": C, "val_a": len(ra), "val_b": len(rb), "val_b_auc": roc_auc(yb, pb), "val_b_ece": ece, "reliability_val_b": bins}
        combo_report[combo] = {"trained": True, **{k: v for k, v in entry["training"].items() if k != "reliability_val_b"}, "thresholds": entry["thresholds"]}
        log.info("combo %s: %s", combo, combo_report[combo])

    trained_any = any(v.get("trained") for v in combo_report.values())
    # Only trained calibrators are stored: the engine falls back to the documented default for any other
    # indicator and reports an indicator as calibrated only when its id is present here.
    cfg.update({"calibrated": trained_any, "indicator_calibrators": cals, "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "note": "Trained by training/stages/train_fusion.py" if trained_any else "No combo had enough data — defaults"})
    out = ctx.stage_dir("train_fusion")
    write_json(out / "fusion.json", cfg)
    dest = ctx.work / "export" / "fusion"
    dest.mkdir(parents=True, exist_ok=True)
    write_json(dest / "fusion.json", cfg)
    return {"calibrated": trained_any, "combos": combo_report, "indicator_calibrators": cal_report}
