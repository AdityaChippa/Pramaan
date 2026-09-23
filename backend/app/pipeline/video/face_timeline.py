"""Per-frame face CNN timeline (§5.2.1) and the landmark/ROI track used by temporal indicators."""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.pipeline.artifacts import ArtifactBag
from app.pipeline.faces import (FOREHEAD_ROI, LEFT_CHEEK_ROI, RIGHT_CHEEK_ROI, detect_faces, eye_aspect_ratio,
                                landmarks_from_result, mouth_aperture, new_video_mesh, roi_mean_rgb)
from app.pipeline.image.face_cnn import MODEL_MISSING, cam_heat_full, draw_boxes, score_faces, sigmoid
from app.pipeline.plots import overlay_heatmap
from app.pipeline.types import IndicatorResult
from app.pipeline.video.frames import Frame, VideoInfo, effective_fps, stream


@dataclass
class FaceTrack:
    fps: float
    t: list[float] = field(default_factory=list)
    landmarks: list[np.ndarray | None] = field(default_factory=list)
    ear: list[float] = field(default_factory=list)
    mouth: list[float] = field(default_factory=list)
    forehead: list[np.ndarray] = field(default_factory=list)
    left_cheek: list[np.ndarray] = field(default_factory=list)
    right_cheek: list[np.ndarray] = field(default_factory=list)

    @property
    def detected(self) -> np.ndarray:
        return np.array([lm is not None for lm in self.landmarks], bool)

    @property
    def face_seconds(self) -> float:
        return float(self.detected.sum()) / self.fps if self.fps > 0 else 0.0


def track_face(info: VideoInfo, target_fps: float) -> FaceTrack:
    fps = effective_fps(info, target_fps)
    tr = FaceTrack(fps=fps)
    nan3 = np.array([np.nan, np.nan, np.nan])
    mesh = new_video_mesh()
    try:
        for fr in stream(info, target_fps):
            h, w = fr.image.shape[:2]
            res = mesh.process(cv2.cvtColor(fr.image, cv2.COLOR_BGR2RGB))
            lms = landmarks_from_result(res, w, h)
            lm = lms[0] if lms else None
            tr.t.append(fr.t)
            tr.landmarks.append(lm)
            if lm is None:
                tr.ear.append(np.nan)
                tr.mouth.append(np.nan)
                tr.forehead.append(nan3)
                tr.left_cheek.append(nan3)
                tr.right_cheek.append(nan3)
            else:
                tr.ear.append(eye_aspect_ratio(lm))
                tr.mouth.append(mouth_aperture(lm))
                tr.forehead.append(roi_mean_rgb(fr.image, lm, FOREHEAD_ROI))
                tr.left_cheek.append(roi_mean_rgb(fr.image, lm, LEFT_CHEEK_ROI))
                tr.right_cheek.append(roi_mean_rgb(fr.image, lm, RIGHT_CHEEK_ROI))
    finally:
        mesh.close()
    return tr


def analyze_frame_scores(model, frames: list[Frame], bag: ArtifactBag, top_k: int = 3) -> IndicatorResult:
    if model is None:
        return IndicatorResult.na("face_cnn", MODEL_MISSING)
    per_frame = []
    for fr in frames:
        faces = detect_faces(fr.image, max_faces=2)
        if not faces:
            continue
        scores = score_faces(model, fr.image, faces)
        best = max(scores, key=lambda s: s.logit)
        per_frame.append((fr, scores, best.logit))
    if not per_frame:
        return IndicatorResult.na("face_cnn", f"No face detected in any of {len(frames)} sampled frames")
    logits = np.array([p[2] for p in per_frame])
    bag.series["frame_scores"] = [{"t": round(fr.t, 3), "p": round(float(sigmoid(l)), 6), "frame_index": fr.index}
                                  for fr, _, l in per_frame]
    ranked = sorted(per_frame, key=lambda p: p[2], reverse=True)[:top_k]
    first_key = None
    for rank, (fr, scores, l) in enumerate(ranked):
        ok_key = bag.add(f"frame_orig_{rank}", f"Frame {fr.index} original", "face_cnn", fr.image, frame_index=fr.index, t=fr.t)
        overlay = draw_boxes(overlay_heatmap(fr.image, cam_heat_full(fr.image.shape, scores)), scores)
        ov_key = bag.add(f"frame_cam_{rank}", f"Frame {fr.index} (t={fr.t:.2f}s) CAM", "face_cnn", overlay,
                         frame_index=fr.index, t=fr.t, original_key=ok_key)
        bag.top_frames.append({"frame_index": fr.index, "t": round(fr.t, 3), "p": round(float(sigmoid(l)), 6),
                               "original_key": ok_key, "overlay_key": ov_key})
        first_key = first_key or ov_key
    return IndicatorResult(
        id="face_cnn",
        value=float(sigmoid(logits.mean())),
        unit="fake prob",
        features={"mean_logit": float(logits.mean()), "p90_logit": float(np.percentile(logits, 90))},
        details={"frames_sampled": len(frames), "frames_with_face": len(per_frame),
                 "max_frame_prob": round(float(sigmoid(logits.max())), 6), "model_version": model.version},
        artifact_key=first_key,
    )
