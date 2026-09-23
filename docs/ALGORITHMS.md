# Algorithms

Every indicator is a function `media → {id, value, unit, features, details, status, artifact}`. The engine turns
`features` into `score_0_1` with a per-indicator calibrator `σ(bias + Σ weight·(f − center)/scale)`; defaults are
documented in `backend/app/pipeline/scoring.py` (`DEFAULT_CALIBRATORS`), trained values replace them after §Training.
Status `not_applicable` (with reason) and `error` never produce a score and are masked out of fusion.

## Image (`backend/app/pipeline/image`)
| Indicator | Computation | Main features |
|---|---|---|
| Face CNN | MediaPipe face detection → 1.3× square crop 256 px → EfficientNet-B4 (DeepfakeBench layout). ONNX outputs `logits` and `cam = Σ_c (w_fake,c − w_real,c)·F_c`, pooled to 8×8. Because the head is global-average-pool + linear, mean(cam) + bias difference equals the logit margin, so the heatmap is an exact decomposition, not a gradient approximation. CAM ReLU-normalised, scaled by the face's probability and pasted back into frame coordinates. | mean / p90 logit over faces |
| UnivFD | CLIP ViT-L/14 image embedding (224 px, bicubic resize + centre crop, CLIP normalisation) → linear probe. Explanation: 7×7 occlusion with the dataset mean; Δlogit per cell. | probe logit |
| Frequency | Grayscale, Hann window, 2-D FFT, azimuthal average of log power; power-law slope fit, high-frequency energy ratio, periodic peak strength vs. a smoothed radial profile (upsampling checkerboard). | slope deviation from natural ≈ −2, peak strength, HF ratio |
| Blending boundary | Face-mesh oval mask; inner face vs. a ring straddling the boundary: Laplacian variance and high-pass noise energy log-ratios. | |log ratios| |
| ELA | Re-encode JPEG q=90, amplified |difference|; face vs. background mean error log-ratio, block outliers. | |log ratio|, block outlier fraction |
| Noise residual | Median-filter residual; 32 px block log-variance; robust z (median/MAD); fraction with |z| > 3. | outlier fraction |
| Lighting (heuristic) | Face-mesh normals + luminance → least-squares Lambertian light direction; angle between faces, or left/right cheek shading asymmetry for one face. Low default weight. | inconsistency |

## Video (`backend/app/pipeline/video`)
- **Frames**: 32 uniformly sampled frames (≤ 60 s; MediaRecorder WebM and over-length clips are transcoded to MJPEG for exact seeking) → face CNN per frame → timeline + top-3 frames with CAM overlays.
- **Tracking pass**: the whole capped clip streamed at ≤ 15 fps; Face Mesh landmarks, EAR, inner-lip aperture and ROI RGB means are stored per frame (see DECISIONS: replaces the 2 s dense window so rPPG gets ≥ 5 s).
- **Landmark jitter**: stable landmarks / inter-ocular distance → iterative generalized Procrustes alignment (rotation, scale, translation removed) → second temporal difference RMS per frame; value = median.
- **Blink**: EAR (Soukupová & Čech) interpolated, 3-tap smoothed; threshold 0.75 × open level (90th percentile); runs ≤ 800 ms are blinks. Rate vs. 8–21 /min, share of durations outside 100–400 ms, completeness from depth relative to a 60 % full closure.
- **rPPG**: forehead + both cheeks, POS projection (Wang et al. 2017, 1.6 s windows, overlap-add) → detrend → Butterworth 0.7–4 Hz → Welch PSD of the ROI mean: peak = pulse; SNR = power at f₀ ± 0.1 Hz and 2f₀ ± 0.2 Hz vs. rest of band; mean pairwise magnitude-squared coherence near f₀. Requires ≥ 5 s tracked face and ≥ 8.4 fps.
- **AV sync**: mouth aperture vs. audio RMS at the analysis frame rate, z-scored; normalized cross-correlation over ±500 ms; max r and its lag.
- **Container**: ffprobe tags (editor signatures, re-encode traces, creation time), packet PTS interval coefficient of variation.

## Audio (`backend/app/pipeline/audio`)
- **AASIST-L**: 16 kHz mono, 64 600-sample windows, hop 32 300 (50 %); short clips tiled. Spoof logit = logit₀ − logit₁. Per-window timeline.
- **Spectral**: native-rate LTAS over energy-VAD active frames; largest drop between adjacent 300 Hz bands above 3 kHz = band-limiting cliff (halved when ≥ 15.5 kHz, typical codec low-pass); spectral flatness; > 4 kHz energy ratio; MFCC Δ std; LFCC (linear triangular filterbank + DCT) high-order variability.
- **Prosody**: Praat pitch (75–500 Hz): F0 coefficient of variation and semitone std, local jitter, local shimmer, HNR.
- **Breath & pause**: 25 ms/10 ms RMS dB; speech = within 35 dB of the 99th percentile and ≥ 10 dB above the floor; gaps < 150 ms bridged. Interior pauses; inhalation candidates 150–800 ms, 6 dB above floor, spectral centroid > 1 kHz, flatness > 0.05. Breaths per 10 s of speech; pause CV.
- **Splice**: STFT 512/160; frame-to-frame spectral-centroid jump and magnitude-weighted phase-advance deviation, robust z against interior speech frames only (onsets excluded); events where max z > 6, merged within 250 ms.

## Metadata & provenance (`backend/app/pipeline/metadata`)
SHA-256 (streamed), 64-bit DCT pHash (32×32 DCT, 8×8 low band vs. median). EXIF/XMP: camera make/model, software/editor tags, PNG text chunks with generator parameters (Stable Diffusion, ComfyUI, Midjourney…), DateTimeOriginal vs. modify time, embedded thumbnail vs. downscaled image difference. C2PA via c2pa-python (signer, claim generator, `c2pa.ai` / trained-algorithmic-media assertions); on failure, JUMBF signature detection reports "present, not validated". Duplicate: Hamming distance to the user's previous case pHashes (informational, not fused).

## Fusion (`backend/app/pipeline/fusion`)
For combo *k* (image, video, video_audio, audio, live):
`xᵢ = clip(logit(scoreᵢ), ±8)`, `mᵢ ∈ {0,1}` availability,
`z = b + Σᵢ (wᵢ xᵢ mᵢ + vᵢ mᵢ)`, `p = σ(a z + β)`.
Contribution of indicator *i* = `a (wᵢ xᵢ + vᵢ) mᵢ` (log-odds, exact: Σ contributions + (a b + β) = final logit).
Group sums (visual / temporal / audio / provenance) are shown with % of total absolute contribution and direction.
Verdict: Manipulated if p ≥ t_high, Authentic if p ≤ t_low, else Inconclusive.

**Defaults (uncalibrated)**: b = v = β = 0, a = 1; learned detectors w ≈ 1 (face CNN 1.0, UnivFD 0.9, AASIST 1.0, C2PA 1.0, EXIF 0.8), handcrafted cues 0.3–0.6, lighting 0.15; thresholds 0.30 / 0.70. Marked `calibrated: false` everywhere.

## Training (`training/stages`)
1. **prepare** — scan contract + ASVspoof protocols; SHA-256 dedupe (label conflicts dropped); cap per class; group-aware stratified 70/15/15 by identity/source folder; validation halved by group into `val_a` / `val_b`.
2. **extract** — engine face detector + crop on images and 8/24 frames per video.
3. **finetune_face** — AdamW + OneCycle, CE loss, augment (flip, JPEG 50–95, blur, colour); quick freezes all but the last 6 MBConv blocks (frozen BN stats); AMP on CUDA; best by validation AUC (pretrained AUC is the baseline — never worse than pretrained is kept).
4. **train_univfd_probe** — cached CLIP embeddings; logistic regression, C by validation AUC vs. the published probe.
5. **finetune_audio** — AASIST-L head (quick) or full model, class-weighted CE, frequency masking augmentation, best by validation AUC; pretrained kept without data.
6. **export** — ONNX opset 17 with the engine's tensor names; dynamic INT8 kept only if validation AUC drops < 0.01.
7. **handcrafted_features** — engine `analyze_file()` with the exported ONNX models on val_a, val_b, test (JSONL, resumable).
8. **train_fusion** — per indicator: standardised features → L2 logistic regression (C by stratified CV) on val_a, stored in calibrator form. Per combo: L2 logistic regression on `[x·m, m]` (val_a); Platt scaling (a, β) on val_b; thresholds on val_b: smallest t_high with FPR ≤ 5 %, largest t_low with FNR ≤ 5 %; reliability bins + ECE.
9. **evaluate** — test split through the engine's `fuse()`: AUC, EER, accuracy / precision / recall / F1 / confusion at t_high, verdict band counts, ECE, reliability, per-combo and per-indicator AUC.
10. **publish** — chunked upload + `model_registry` rows; activate; ping engine reload.

## Grounding validator (`web/src/lib/grounding.ts`)
Numbers are extracted from every string in the LLM output after removing UUIDs, hex hashes and ISO timestamps. Each must match a number found anywhere in the case JSON (including numbers inside strings such as expected ranges) within max(half a unit in its last printed decimal, 0.5 % relative), also accepting ×100 (percentages) and ×60 (Hz → bpm). Integers 0–3 are exempt. Failure → one regeneration with the offending numbers listed → otherwise stored with `grounding_warning: true`.
