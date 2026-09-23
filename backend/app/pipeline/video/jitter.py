"""Landmark temporal jitter after Procrustes pose removal (§5.2.2)."""
from __future__ import annotations

import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.faces import STABLE, iod
from app.pipeline.plots import line_plot
from app.pipeline.types import IndicatorResult
from app.pipeline.video.face_timeline import FaceTrack


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    runs, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(mask)))
    return runs


def procrustes_align(shape: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Similarity transform (rotation, scale, translation) of `shape` onto `ref`, both (K,2)."""
    mu_s, mu_r = shape.mean(0), ref.mean(0)
    s0, r0 = shape - mu_s, ref - mu_r
    u, sig, vt = np.linalg.svd(r0.T @ s0)
    d = np.sign(np.linalg.det(u @ vt))
    dmat = np.diag([1.0, d])
    rot = u @ dmat @ vt
    scale = float((sig * np.diag(dmat)).sum() / (s0 ** 2).sum()) if (s0 ** 2).sum() > 0 else 1.0
    return (scale * (rot @ s0.T)).T + mu_r


def analyze_jitter(track: FaceTrack, bag: ArtifactBag, min_seconds: float = 1.0) -> IndicatorResult:
    min_len = max(5, int(round(min_seconds * track.fps)))
    runs = [r for r in _runs(track.detected) if r[1] - r[0] >= min_len]
    if not runs:
        return IndicatorResult.na("landmark_jitter", f"Needs ≥{min_seconds:.0f} s of continuously tracked face")
    energies, times = [], []
    for a, b in runs:
        pts = np.stack([track.landmarks[i][STABLE, :2] / max(iod(track.landmarks[i]), 1e-6) for i in range(a, b)])
        ref = pts.mean(0)
        for _ in range(2):
            aligned = np.stack([procrustes_align(p, ref) for p in pts])
            ref = aligned.mean(0)
        acc = aligned[2:] - 2 * aligned[1:-1] + aligned[:-2]
        per_frame = np.sqrt((acc ** 2).sum(-1).mean(-1))
        energies.append(per_frame)
        times.extend(track.t[a + 1:b - 1])
    e = np.concatenate(energies)
    jitter = float(np.median(e))
    plot = line_plot([(times, e, "2nd-difference RMS (IOD)")], "Pose-removed landmark jitter", "time (s)", "IOD",
                     hlines=[(0.012, "reference 0.012")])
    key = bag.add("landmark_jitter", "Landmark jitter energy", "landmark_jitter", plot)
    return IndicatorResult(
        id="landmark_jitter", value=jitter, unit="IOD",
        features={"log_jitter": float(np.log(max(jitter, 1e-6))), "jitter_p90": float(np.percentile(e, 90))},
        details={"analysis_fps": round(track.fps, 2), "frames": int(e.size), "segments": len(runs)},
        artifact_key=key,
    )
