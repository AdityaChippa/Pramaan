"""Lighting consistency (lite heuristic, §5.1.7): Lambertian fit of face-mesh normals to shading."""
from __future__ import annotations

import math

import cv2
import numpy as np
from scipy.spatial import Delaunay

from app.pipeline.faces import LEFT_CHEEK_ROI, RIGHT_CHEEK_ROI, Face
from app.pipeline.types import IndicatorResult


def _fit_light(gray: np.ndarray, lm: np.ndarray) -> dict[str, object] | None:
    pts = lm[:468].astype(np.float64)
    tri = Delaunay(pts[:, :2]).simplices
    a, b, c = pts[tri[:, 0]], pts[tri[:, 1]], pts[tri[:, 2]]
    n = np.cross(b - a, c - a)
    norm = np.linalg.norm(n, axis=1, keepdims=True)
    good = norm[:, 0] > 1e-6
    n = n[good] / norm[good]
    # MediaPipe z is negative towards the camera; orient normals to face the camera.
    n[n[:, 2] > 0] *= -1
    cent = ((a + b + c) / 3)[good]
    facing = -n[:, 2] > 0.2
    n, cent = n[facing], cent[facing]
    if len(n) < 60:
        return None
    h, w = gray.shape
    xs = np.clip(cent[:, 0].round().astype(int), 0, w - 1)
    ys = np.clip(cent[:, 1].round().astype(int), 0, h - 1)
    blurred = cv2.GaussianBlur(gray, (0, 0), 2.0)
    intensity = blurred[ys, xs].astype(np.float64)
    design = np.column_stack([n[:, 0], n[:, 1], -n[:, 2], np.ones(len(n))])
    coef, *_ = np.linalg.lstsq(design, intensity, rcond=None)
    pred = design @ coef
    ss_res = float(((intensity - pred) ** 2).sum())
    ss_tot = float(((intensity - intensity.mean()) ** 2).sum()) + 1e-9
    light = coef[:3]
    ln = float(np.linalg.norm(light))
    return {"light": (light / ln).tolist() if ln > 1e-9 else [0.0, 0.0, 0.0], "r2": 1 - ss_res / ss_tot, "coef": coef.tolist()}


def _cheek_mean(gray: np.ndarray, lm: np.ndarray, idx: list[int]) -> float:
    m = np.zeros(gray.shape, np.uint8)
    cv2.fillConvexPoly(m, cv2.convexHull(lm[idx, :2].astype(np.int32)), 1)
    return float(gray[m.astype(bool)].mean()) if m.sum() > 10 else float("nan")


def analyze_lighting(img_bgr: np.ndarray, faces: list[Face]) -> IndicatorResult:
    meshes = [f for f in faces if f.landmarks is not None]
    if not meshes:
        return IndicatorResult.na("lighting", "No face mesh detected")
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    fits = [(f, _fit_light(gray, f.landmarks)) for f in meshes]
    fits = [(f, r) for f, r in fits if r is not None]
    if not fits:
        return IndicatorResult.na("lighting", "Not enough camera-facing mesh triangles for a shading fit")
    details: dict[str, object] = {"heuristic": True, "faces": [{"light_direction": [round(v, 4) for v in r["light"]], "fit_r2": round(r["r2"], 4)} for _, r in fits]}
    if len(fits) >= 2:
        l1 = np.array(fits[0][1]["light"][:2])
        l2 = np.array(fits[1][1]["light"][:2])
        if np.linalg.norm(l1) < 1e-6 or np.linalg.norm(l2) < 1e-6:
            return IndicatorResult.na("lighting", "Degenerate light-direction estimate")
        cosang = float(np.dot(l1, l2) / (np.linalg.norm(l1) * np.linalg.norm(l2)))
        angle = math.acos(max(-1.0, min(1.0, cosang)))
        inconsistency = angle / math.pi
        details.update({"mode": "inter_face_angle", "angle_deg": round(math.degrees(angle), 2)})
    else:
        face, fit = fits[0]
        lm = face.landmarks
        left, right = _cheek_mean(gray, lm, LEFT_CHEEK_ROI), _cheek_mean(gray, lm, RIGHT_CHEEK_ROI)
        if not (np.isfinite(left) and np.isfinite(right)) or min(left, right) < 1:
            return IndicatorResult.na("lighting", "Cheek regions not measurable")
        coef = np.array(fit["coef"])

        def predicted(idx: list[int]) -> float:
            p = lm[idx].astype(np.float64)
            # Mean normal of a cheek patch approximated from the plane through its landmarks.
            centered = p - p.mean(axis=0)
            _, _, vt = np.linalg.svd(centered)
            nrm = vt[-1]
            if nrm[2] > 0:
                nrm = -nrm
            return float(coef[0] * nrm[0] + coef[1] * nrm[1] + coef[2] * -nrm[2] + coef[3])

        pl, pr = predicted(LEFT_CHEEK_ROI), predicted(RIGHT_CHEEK_ROI)
        if min(pl, pr) <= 1:
            return IndicatorResult.na("lighting", "Shading model predicts non-positive cheek intensity")
        inconsistency = abs(math.log(left / right) - math.log(pl / pr))
        details.update({"mode": "cheek_asymmetry", "observed_left_right": [round(left, 2), round(right, 2)],
                        "predicted_left_right": [round(pl, 2), round(pr, 2)]})
    return IndicatorResult(id="lighting", value=inconsistency, unit="inconsistency",
                           features={"inconsistency": inconsistency, "fit_r2": float(fits[0][1]["r2"])}, details=details)
