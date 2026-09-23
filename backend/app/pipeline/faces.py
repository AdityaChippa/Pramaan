"""MediaPipe Face Detection + Face Mesh helpers shared by inference and training."""
from __future__ import annotations

import threading
from dataclasses import dataclass

import cv2
import numpy as np

_lock = threading.Lock()
_detector = None
_static_mesh = None

# Face Mesh landmark index sets (468 + 10 iris landmarks with refine_landmarks=True).
RIGHT_EYE_EAR = [33, 160, 158, 133, 153, 144]
LEFT_EYE_EAR = [362, 385, 387, 263, 373, 380]
IOD_PAIR = (33, 263)
INNER_LIP = (13, 14)
MOUTH_CORNERS = (78, 308)
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
             152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
FOREHEAD_ROI = [103, 67, 109, 10, 338, 297, 332, 333, 299, 337, 151, 108, 69, 104]
LEFT_CHEEK_ROI = [117, 118, 101, 36, 205, 187, 123, 116]
RIGHT_CHEEK_ROI = [346, 347, 330, 266, 425, 411, 352, 345]
# Rigid-ish landmarks used for pose-removed jitter (oval + nose bridge + tip), excluding eyes and mouth.
STABLE = FACE_OVAL + [1, 4, 5, 6, 168, 197, 195]


@dataclass
class Face:
    box: tuple[int, int, int, int]  # x, y, w, h in pixels
    score: float
    landmarks: np.ndarray | None  # (478, 3): x px, y px, z (px-scaled relative depth)


def _mp():
    import mediapipe as mp  # heavy import; deferred

    return mp


def _get_detector():
    global _detector
    if _detector is None:
        _detector = _mp().solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
    return _detector


def _get_static_mesh():
    global _static_mesh
    if _static_mesh is None:
        _static_mesh = _mp().solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=4, refine_landmarks=True, min_detection_confidence=0.5
        )
    return _static_mesh


def new_video_mesh():
    """Tracking Face Mesh for one video stream (not shared across threads)."""
    return _mp().solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1, refine_landmarks=True,
        min_detection_confidence=0.5, min_tracking_confidence=0.5,
    )


def landmarks_from_result(result, w: int, h: int) -> list[np.ndarray]:
    out = []
    for fl in result.multi_face_landmarks or []:
        arr = np.array([[p.x * w, p.y * h, p.z * w] for p in fl.landmark], dtype=np.float32)
        out.append(arr)
    return out


def detect_faces(img_bgr: np.ndarray, max_faces: int = 4) -> list[Face]:
    h, w = img_bgr.shape[:2]
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    with _lock:
        det = _get_detector().process(rgb)
        mesh = _get_static_mesh().process(rgb)
    meshes = landmarks_from_result(mesh, w, h)
    faces: list[Face] = []
    for d in det.detections or []:
        bb = d.location_data.relative_bounding_box
        x, y = int(bb.xmin * w), int(bb.ymin * h)
        bw, bh = int(bb.width * w), int(bb.height * h)
        x, y = max(0, x), max(0, y)
        bw, bh = min(w - x, bw), min(h - y, bh)
        if bw < 16 or bh < 16:
            continue
        cx, cy = x + bw / 2, y + bh / 2
        lm = None
        best = 1e18
        for m in meshes:
            mc = m[:, :2].mean(axis=0)
            dist = (mc[0] - cx) ** 2 + (mc[1] - cy) ** 2
            if dist < best and x <= mc[0] <= x + bw and y <= mc[1] <= y + bh:
                best, lm = dist, m
        faces.append(Face(box=(x, y, bw, bh), score=float(d.score[0]) if d.score else 0.0, landmarks=lm))
    faces.sort(key=lambda f: f.box[2] * f.box[3], reverse=True)
    return faces[:max_faces]


def square_crop_box(box: tuple[int, int, int, int], img_w: int, img_h: int, scale: float = 1.3) -> tuple[int, int, int, int]:
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2
    side = max(w, h) * scale
    x0 = int(round(cx - side / 2))
    y0 = int(round(cy - side / 2))
    side_i = int(round(side))
    x0 = max(0, min(x0, img_w - 1))
    y0 = max(0, min(y0, img_h - 1))
    side_i = max(1, min(side_i, img_w - x0, img_h - y0))
    return x0, y0, side_i, side_i


def crop_face(img_bgr: np.ndarray, box: tuple[int, int, int, int], size: int = 256) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Square 1.3× crop resized to `size` (DeepfakeBench-style margin). Returns RGB crop and crop box."""
    h, w = img_bgr.shape[:2]
    cb = square_crop_box(box, w, h)
    x0, y0, s, _ = cb
    crop = img_bgr[y0:y0 + s, x0:x0 + s]
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA if s > size else cv2.INTER_CUBIC)
    return cv2.cvtColor(crop, cv2.COLOR_BGR2RGB), cb


def polygon_mask(shape: tuple[int, int], pts: np.ndarray) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    hull = cv2.convexHull(pts.astype(np.int32))
    cv2.fillConvexPoly(m, hull, 1)
    return m.astype(bool)


def iod(lm: np.ndarray) -> float:
    a, b = lm[IOD_PAIR[0], :2], lm[IOD_PAIR[1], :2]
    return float(np.linalg.norm(a - b))


def eye_aspect_ratio(lm: np.ndarray) -> float:
    def ear(idx: list[int]) -> float:
        p = lm[idx, :2]
        v = np.linalg.norm(p[1] - p[5]) + np.linalg.norm(p[2] - p[4])
        hz = 2.0 * np.linalg.norm(p[0] - p[3])
        return float(v / hz) if hz > 1e-6 else float("nan")

    return float(np.nanmean([ear(RIGHT_EYE_EAR), ear(LEFT_EYE_EAR)]))


def mouth_aperture(lm: np.ndarray) -> float:
    d = iod(lm)
    return float(np.linalg.norm(lm[INNER_LIP[0], :2] - lm[INNER_LIP[1], :2]) / d) if d > 1e-6 else float("nan")


def roi_mean_rgb(img_bgr: np.ndarray, lm: np.ndarray, idx: list[int]) -> np.ndarray:
    pts = lm[idx, :2]
    x0, y0 = np.floor(pts.min(axis=0)).astype(int)
    x1, y1 = np.ceil(pts.max(axis=0)).astype(int)
    h, w = img_bgr.shape[:2]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1 + 1), min(h, y1 + 1)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return np.array([np.nan, np.nan, np.nan])
    sub = img_bgr[y0:y1, x0:x1]
    m = polygon_mask(sub.shape[:2], pts - np.array([x0, y0]))
    if m.sum() < 4:
        return np.array([np.nan, np.nan, np.nan])
    px = sub[m].astype(np.float64)
    return px[:, ::-1].mean(axis=0)  # RGB
