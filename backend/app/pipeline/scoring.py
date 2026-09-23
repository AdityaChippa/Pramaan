"""Indicator catalog and indicator-level score calibration.

score_0_1 = sigmoid(bias + Σ_k weight_k · (feature_k − center_k) / scale_k)

Defaults below are documented, literature-informed starting points (docs/ALGORITHMS.md) and are
reported as `calibrated: false`. `training/stages/train_fusion.py` fits these calibrators on the
validation split and ships them inside the fusion JSON (`indicator_calibrators`).
"""
from __future__ import annotations

import math
from typing import Any

from app.pipeline.types import STATUS_OK, IndicatorResult, finite

CATALOG: dict[str, dict[str, str]] = {
    "face_cnn": dict(name="Face-manipulation CNN", modality="image", group="visual", unit="fake prob",
                     method="EfficientNet-B4 face-crop classifier; class activation map computed inside the ONNX graph",
                     reference="Tan & Le 2019; Yan et al., DeepfakeBench (NeurIPS 2023)", expected_range="fake probability < 0.5"),
    "univfd": dict(name="Generic AI-generated image detector", modality="image", group="visual", unit="fake prob",
                   method="Frozen CLIP ViT-L/14 embedding + linear probe; 7×7 occlusion map",
                   reference="Ojha, Li & Lee, UnivFD (CVPR 2023)", expected_range="fake probability < 0.5"),
    "freq_spectrum": dict(name="Frequency-domain spectrum", modality="image", group="visual", unit="slope",
                          method="Azimuthally averaged log power spectrum: high-frequency ratio, spectral slope, periodic peak strength",
                          reference="Durall et al. 2020; Frank et al., ICML 2020", expected_range="slope ≈ −2 ± 0.6; peak strength < 6"),
    "blend_boundary": dict(name="Blending-boundary discontinuity", modality="image", group="visual", unit="|log ratio|",
                           method="Laplacian variance and high-pass noise inside the face vs. a ring at the face-mesh boundary",
                           reference="Li & Lyu, Face Warping Artifacts (CVPRW 2019)", expected_range="|log ratio| sum < 0.8"),
    "ela": dict(name="Error Level Analysis", modality="image", group="visual", unit="|log ratio|",
                method="Recompress at JPEG quality 90; amplified absolute difference; face vs. background statistics",
                reference="Krawetz 2007, A Picture's Worth", expected_range="|log(face/background)| < 0.5"),
    "noise_residual": dict(name="Noise residual consistency", modality="image", group="visual", unit="outlier fraction",
                           method="Median-filter residual; 32 px block variance; robust z-score outliers",
                           reference="Mahdian & Saic 2009; Lyu, Pan & Zhang 2014", expected_range="outlier block fraction < 0.05"),
    "lighting": dict(name="Lighting consistency (heuristic)", modality="image", group="visual", unit="inconsistency",
                     method="Lambertian fit of face-mesh normals to shading; inter-face light angle or cheek shading asymmetry",
                     reference="Johnson & Farid 2005", expected_range="inconsistency < 0.3"),
    "landmark_jitter": dict(name="Landmark temporal jitter", modality="video", group="temporal", unit="IOD",
                            method="Procrustes-aligned Face Mesh landmarks normalized by inter-ocular distance; second-difference RMS",
                            reference="Sun et al., LRNet (CVPR 2021)", expected_range="jitter < 0.012 IOD"),
    "blink": dict(name="Blink analysis", modality="video", group="temporal", unit="blinks/min",
                  method="Eye Aspect Ratio series: blink rate, duration distribution, closure completeness",
                  reference="Soukupová & Čech 2016; Li, Chang & Lyu, In Ictu Oculi (WIFS 2018); Bentivoglio et al. 1997",
                  expected_range="8–21 blinks/min; 100–400 ms"),
    "rppg": dict(name="rPPG biological signal", modality="video", group="temporal", unit="coherence",
                 method="POS projection of forehead/cheek ROI RGB means, detrend, 0.7–4 Hz band-pass, pulse SNR and cross-ROI coherence",
                 reference="Ciftci, Demir & Yin, FakeCatcher (TPAMI 2020); Wang et al., POS (IEEE TBME 2017)", expected_range="coherence > 0.5; SNR > 3 dB"),
    "av_sync": dict(name="Audio–visual sync", modality="video", group="temporal", unit="max corr",
                    method="Inner-lip aperture vs. audio RMS envelope: max normalized cross-correlation and lag",
                    reference="Chung & Zisserman, SyncNet (ACCVW 2016)", expected_range="max corr > 0.3; |lag| < 200 ms"),
    "container": dict(name="Container / encoding forensics", modality="video", group="provenance", unit="interval CV",
                      method="ffprobe codec and encoder tags, creation time, re-encode traces, frame-interval irregularity",
                      reference="Milani et al., video forensics overview (APSIPA 2012)", expected_range="no editor tags; interval CV < 0.1"),
    "aasist": dict(name="AASIST-L anti-spoofing", modality="audio", group="audio", unit="spoof prob",
                   method="Graph attention over raw-waveform spectro-temporal features; 4 s windows, 50% overlap",
                   reference="Jung et al., AASIST (ICASSP 2022)", expected_range="spoof probability < 0.5"),
    "audio_spectral": dict(name="Spectral artifacts", modality="audio", group="audio", unit="band-limit",
                           method="MFCC/LFCC statistics, spectral flatness, >4 kHz energy, band-limiting cutoff at native sample rate",
                           reference="Frank & Schönherr, WaveFake (NeurIPS 2021); Sahidullah et al. 2015", expected_range="no sharp cutoff; flatness 0.05–0.3"),
    "prosody": dict(name="Prosody", modality="audio", group="audio", unit="F0 CV",
                    method="Praat pitch contour: F0 variability, jitter (local), shimmer (local), HNR",
                    reference="Boersma 1993; Teixeira, Oliveira & Lopes 2013", expected_range="F0 CV 0.1–0.3; jitter 0.4–1.5%; shimmer 2–6%"),
    "breath_pause": dict(name="Breath & pause pattern", modality="audio", group="audio", unit="breaths/10 s",
                         method="Energy VAD; inhalation-like low-energy broadband segments between phrases; pause regularity",
                         reference="Mostaani et al., breathing cues for synthetic speech detection (2022)", expected_range="≥1 breath per 10 s speech; pause CV > 0.3"),
    "splice": dict(name="Splice / continuity discontinuity", modality="audio", group="audio", unit="robust z",
                   method="Robust z-scores of spectral-centroid jumps and phase-advance deviation between frames",
                   reference="Chen et al., audio splicing detection (2017)", expected_range="max robust z < 6"),
    "exif_metadata": dict(name="EXIF/XMP & generator metadata", modality="metadata", group="provenance", unit="flags",
                          method="EXIF/XMP tags, PNG text chunks (Stable Diffusion/ComfyUI/Midjourney), timestamp and thumbnail consistency",
                          reference="Kee, Johnson & Farid 2011", expected_range="camera tags present; no generator tags"),
    "c2pa": dict(name="C2PA Content Credentials", modality="metadata", group="provenance", unit="flags",
                 method="c2pa-python manifest validation; JUMBF byte-signature fallback",
                 reference="C2PA Technical Specification 2.x", expected_range="valid manifest without AI assertion"),
    "duplicate": dict(name="Duplicate / near-duplicate", modality="metadata", group="provenance", unit="Hamming bits",
                      method="64-bit DCT perceptual hash; Hamming distance to your previous cases",
                      reference="Zauner 2010, pHash", expected_range="informational"),
}


def _f(w: float, c: float = 0.0, s: float = 1.0) -> dict[str, float]:
    return {"weight": w, "center": c, "scale": s}


DEFAULT_CALIBRATORS: dict[str, dict[str, Any]] = {
    "face_cnn": {"bias": 0.0, "features": {"mean_logit": _f(0.5), "p90_logit": _f(0.5)}},
    "univfd": {"bias": 0.0, "features": {"logit": _f(1.0)}},
    "freq_spectrum": {"bias": 0.0, "features": {"slope_deviation": _f(1.0, 0.6, 0.3), "peak_strength": _f(1.2, 6.0, 3.0)}},
    "blend_boundary": {"bias": 0.0, "features": {"sharpness_log_ratio_abs": _f(0.8, 0.4, 0.25), "noise_log_ratio_abs": _f(0.8, 0.4, 0.25)}},
    "ela": {"bias": 0.0, "features": {"ela_log_ratio_abs": _f(1.0, 0.5, 0.25), "ela_block_outlier": _f(0.5, 0.05, 0.05)}},
    "noise_residual": {"bias": 0.0, "features": {"outlier_fraction": _f(1.0, 0.05, 0.03)}},
    "lighting": {"bias": 0.0, "features": {"inconsistency": _f(1.0, 0.3, 0.15)}},
    "landmark_jitter": {"bias": 0.0, "features": {"log_jitter": _f(1.0, math.log(0.012), 0.5)}},
    "blink": {"bias": 0.0, "features": {"rate_deviation": _f(1.0, 0.3, 0.3), "duration_deviation": _f(0.5, 0.3, 0.3), "incompleteness": _f(0.5, 0.5, 0.2)}},
    "rppg": {"bias": 0.0, "features": {"coherence": _f(-1.0, 0.5, 0.15), "snr_db": _f(-0.5, 3.0, 2.0)}},
    "av_sync": {"bias": 0.0, "features": {"max_corr": _f(-1.0, 0.3, 0.1), "abs_lag_ms": _f(0.5, 150.0, 100.0)}},
    "container": {"bias": -1.0, "features": {"editor_tag": _f(1.5), "interval_cv": _f(0.5, 0.1, 0.1), "missing_creation_time": _f(0.3), "reencode_trace": _f(0.3)}},
    "aasist": {"bias": 0.0, "features": {"mean_logit": _f(0.5), "max_logit": _f(0.5)}},
    "audio_spectral": {"bias": 0.0, "features": {"band_limit_score": _f(1.0, 0.3, 0.2), "flatness_mean": _f(0.5, 0.3, 0.1)}},
    "prosody": {"bias": 0.0, "features": {"f0_cv": _f(-0.8, 0.1, 0.04), "jitter_local": _f(-0.6, 0.004, 0.002), "shimmer_local": _f(-0.4, 0.025, 0.012), "hnr_db": _f(0.3, 22.0, 5.0)}},
    "breath_pause": {"bias": 0.0, "features": {"breaths_per_10s": _f(-0.7, 0.5, 0.5), "pause_cv": _f(-0.7, 0.3, 0.15)}},
    "splice": {"bias": 0.0, "features": {"max_robust_z": _f(1.0, 6.0, 2.0)}},
    "exif_metadata": {"bias": 0.0, "features": {"generator_tag": _f(4.0), "editor_tag": _f(1.0), "camera_present": _f(-0.8), "timestamp_inconsistent": _f(0.6), "thumbnail_mismatch": _f(1.0), "metadata_absent": _f(0.4)}},
    "c2pa": {"bias": 0.0, "features": {"ai_assertion": _f(4.0), "valid": _f(-1.0)}},
}


def sigmoid(z: float) -> float:
    z = max(-40.0, min(40.0, z))
    return 1.0 / (1.0 + math.exp(-z))


def apply_calibrator(features: dict[str, float], cal: dict[str, Any]) -> float:
    z = finite(cal.get("bias", 0.0))
    for name, p in cal.get("features", {}).items():
        if name not in features:
            continue
        scale = finite(p.get("scale", 1.0), 1.0) or 1.0
        z += finite(p.get("weight", 0.0)) * (finite(features[name]) - finite(p.get("center", 0.0))) / scale
    return sigmoid(z)


def to_indicator_dict(r: IndicatorResult, fusion_cfg: dict[str, Any] | None) -> dict[str, Any]:
    """Merge catalog metadata, compute score_0_1 with trained calibrators when available."""
    meta = CATALOG[r.id]
    trained = (fusion_cfg or {}).get("indicator_calibrators", {}) if (fusion_cfg or {}).get("calibrated") else {}
    cal = trained.get(r.id) or DEFAULT_CALIBRATORS.get(r.id)
    score = None
    if r.status == STATUS_OK and cal is not None:
        score = round(apply_calibrator(r.features, cal), 6)
    return {
        "id": r.id,
        "name": meta["name"],
        "modality": meta["modality"],
        "group": meta["group"],
        "status": r.status,
        "reason": r.reason,
        "value": None if r.value is None else round(finite(r.value), 6),
        "unit": r.unit or meta["unit"],
        "expected_range": meta["expected_range"],
        "score_0_1": score,
        "features": {k: round(finite(v), 6) for k, v in r.features.items()},
        "evidence_artifact_url": None,
        "method": meta["method"],
        "reference": meta["reference"],
        "calibrated": bool(r.id in trained),
        "details": r.details,
        "_artifact_key": r.artifact_key,
    }
