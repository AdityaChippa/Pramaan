"""Near-duplicate lookup of the pHash against the user's previous cases (informational)."""
from __future__ import annotations

from typing import Any

from app.pipeline.metadata.hashing import hamming
from app.pipeline.types import STATUS_INFO, IndicatorResult

NEAR_DUPLICATE_BITS = 10


def analyze_duplicates(sha256: str, phash: str | None, prior: list[dict[str, Any]] | None) -> IndicatorResult:
    if prior is None:
        return IndicatorResult.na("duplicate", "No case history available (offline analysis)")
    exact = [p for p in prior if p.get("sha256") and p["sha256"] == sha256]
    if phash is None:
        return IndicatorResult(id="duplicate", status=STATUS_INFO, value=None, unit="Hamming bits",
                               reason="No visual content for a perceptual hash", details={
                                   "exact_matches": [{"case_id": p["id"], "filename": p.get("filename")} for p in exact[:5]],
                                   "compared_cases": len(prior)})
    scored = []
    for p in prior:
        if p.get("phash"):
            try:
                scored.append((hamming(phash, p["phash"]), p))
            except ValueError:
                continue
    scored.sort(key=lambda x: x[0])
    nearest = scored[0][0] if scored else None
    near = [{"case_id": p["id"], "filename": p.get("filename"), "distance": d, "created_at": p.get("created_at")}
            for d, p in scored if d <= NEAR_DUPLICATE_BITS][:5]
    return IndicatorResult(
        id="duplicate", status=STATUS_INFO, value=None if nearest is None else float(nearest), unit="Hamming bits",
        details={"nearest_distance": nearest, "near_duplicates": near, "threshold_bits": NEAR_DUPLICATE_BITS,
                 "exact_matches": [{"case_id": p["id"], "filename": p.get("filename")} for p in exact[:5]],
                 "compared_cases": len(scored)},
    )
