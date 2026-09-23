"""Three-band verdict: a forensic tool never forces a binary answer."""
from __future__ import annotations


def verdict_for(p: float, t_low: float, t_high: float) -> str:
    if p >= t_high:
        return "manipulated"
    if p <= t_low:
        return "authentic"
    return "inconclusive"
