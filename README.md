# PRAMAAN — explainable forensics for synthetic media .

> **प्रमाण (pramāṇa)** — Sanskrit for *proof*.

**🔗 Live frontend: https://pramaan-sage-six.vercel.app/**

> **Read this before you click.** The web app is deployed and public. The **detection engine is not** —
> it is a ~2 GB Python service that runs locally (see [Why the engine isn't deployed](#17-why-the-engine-is-not-deployed-and-how-to-deploy-it)).
> On the live link you can browse the landing page, the Model Card, the API docs and the public
> `/verify` page, but **uploading a file will show "Engine waking up"** until an engine is running and
> reachable. To see analysis end-to-end, follow [Section 10 — Run it locally](#10-run-it-locally).

Built for **Forensic Frontiers 2026 (SRM × NFSU), Theme 2 — Deepfake & Synthetic Media Detection System**. 🏆 *Winning entry.*

---

## Table of contents

1. [The problem](#1-the-problem)
2. [What PRAMAAN does](#2-what-pramaan-does)
3. [What makes it different](#3-what-makes-it-different)
4. [Screenshots](#4-screenshots)
5. [Architecture](#5-architecture)
6. [The life of one uploaded file](#6-the-life-of-one-uploaded-file)
7. [The 20 forensic indicators](#7-the-20-forensic-indicators)
8. [The fusion model — exact explanations](#8-the-fusion-model--exact-explanations)
9. [What "uncalibrated defaults" means](#9-what-uncalibrated-defaults-means)
10. [Run it locally](#10-run-it-locally)
11. [Training pipeline](#11-training-pipeline)
12. [Repository structure](#12-repository-structure)
13. [Environment variables](#13-environment-variables)
14. [Database & storage](#14-database--storage)
15. [Public REST API](#15-public-rest-api)
16. [Tech stack and why each piece](#16-tech-stack-and-why-each-piece)
17. [Why the engine is not deployed, and how to deploy it](#17-why-the-engine-is-not-deployed-and-how-to-deploy-it)
18. [Limitations — read this honestly](#18-limitations--read-this-honestly)
19. [Documentation index](#19-documentation-index)
20. [References and credits](#20-references-and-credits)
21. [License](#21-license)

---

## 1. The problem

In early 2024 a finance employee in Hong Kong joined a video call with his CFO and several colleagues.
Every person on that call was synthetic. He transferred roughly **US$25 million**.

That is not an outlier any more. A convincing fake face costs nothing. A cloned voice needs a few seconds
of audio scraped from Instagram. In India this already shows up as:

- **Video-KYC spoofing** — synthetic faces used to open bank accounts remotely.
- **"Digital arrest" scams** — a fabricated police officer on a video call demanding money.
- **Cloned-voice calls** — a parent hears their child's voice claiming an emergency.
- **Election manipulation** — doctored clips released days before a vote, too late to debunk.

Now look at the defence. Most detection tools return a single number: *"AI-generated, 87 %."*
Ask **why** and there is no answer.

That is useless in the two places it matters most:

- In a **courtroom**, evidence must be explainable and reproducible. An expert cannot testify *"the black box said 87."*
- In a **newsroom or a bank**, a human has to make a decision and own the consequences. A black box cannot
  tell them when it was actually unsure.

**Deepfake detection is not a classification problem. It is an evidence problem.**

---

## 2. What PRAMAAN does

PRAMAAN takes an image, video or audio file and produces a **forensic report**, not a verdict sticker.

For every case it returns:

| Output | Detail |
|---|---|
| **Verdict** | `Authentic` / `Inconclusive` / `Manipulated` — three bands, not a forced binary |
| **Calibrated probability** | With the decision thresholds drawn on the gauge |
| **20 indicators** | Each with its measured value, the expected range for authentic media, a suspicion score, and an academic citation |
| **Modality contribution chart** | Exact log-odds contributions grouped into visual / temporal-biological / audio / provenance |
| **Heatmaps** | Class-activation overlays with an original↔overlay slider, plus the top suspicious video frames |
| **Timelines** | Per-frame manipulation score, per-window audio spoof score, eye-aspect-ratio curve, rPPG pulse signals, AV-sync correlation |
| **Chain of custody** | SHA-256 at capture *and* ingestion, pHash, every pipeline step timestamped |
| **LLM report** | Technical forensic report + plain-language executive summary + grounded Q&A chat |
| **Court-style PDF** | With hash table, custody log and a QR code to a public verification page |

Plus: a **Live Monitor** (rolling 3-second webcam/mic analysis), an **Evidence Gallery** archive, a
**Model Card** with real metrics, and a **public REST API** with hashed keys and monthly quotas.

---

## 3. What makes it different

### 3.1 Explanations that are *exact*, not approximate

Most explainable-AI tools give you a heatmap derived from a gradient approximation and a hand-wavy
"feature importance". PRAMAAN's fusion is a **logistic model in log-odds space**, which means each
indicator's contribution is literally `weight × value`, and **all contributions sum exactly to the final
score**. On the result screen, the bars add up to the logit printed underneath. A judge can check the
arithmetic.

The face-detector heatmap is exact too: the classifier head is global-average-pooling followed by a
linear layer, so the class-activation map decomposes the logit precisely — and it is computed **inside
the ONNX graph**, so no PyTorch is needed at inference time.

### 3.2 Honest abstention

Every indicator can return `not_applicable` **with a reason**:

- *"Needs ≥5 s of tracked face (got 2.1 s)"*
- *"Not analyzed — no audio track"*
- *"No face detected in any of 32 sampled frames"*

Those indicators are then **masked out** of the fusion — the system does not impute a neutral 0.5 and
pretend it measured something. This is the difference between a demo and forensic software.

### 3.3 Biological and physical signals, not just a CNN

PRAMAAN measures things a generator cannot easily fake because they come from **physics and physiology**,
not from a training set:

- **Pulse (rPPG)** — skin colour oscillates with each heartbeat. Extracted from forehead and both cheeks;
  a real face shows a *coherent* pulse across all three regions, a generated one usually does not.
- **Blink dynamics** — rate and duration checked against the medical range (8–21 blinks/min, 100–400 ms).
- **Landmark jitter** — after removing head pose with Procrustes alignment, real faces move smoothly.
- **Breathing** — humans inhale between phrases; many TTS systems do not.
- **Vocal micro-variation** — jitter, shimmer and HNR via Praat. Synthetic voices are often *too* regular.

These generalise to generators nobody has seen yet.

### 3.4 Chain of custody, built in

The file is hashed in the **browser** (Web Crypto, SHA-256) before upload, hashed **again** by the engine,
and the two must match or the case fails. Every pipeline step is timestamped in Postgres and printed in
the PDF. The report carries a QR code to a public verification page where anyone can drop the file and
confirm it is byte-identical to the analysed evidence.

Re-analysis with newer models creates a **linked new case** — the original result is never overwritten.

### 3.5 The system tells you how much to trust it

If the fusion weights have not been trained on a validation split, **every screen says so**. The Model
Card shows real AUC, EER, confusion matrix and a reliability curve from the project's own test split —
or it says "not trained yet". **No accuracy figure is ever displayed that was not measured.**

---

## 4. Screenshots

Place your PNGs in `docs/screenshots/` with these names and they will render here.

| | |
|---|---|
| ![Landing](docs/screenshots/landing.png) **Landing** — R3F point-cloud face with a sweeping scan plane | ![Analyze](docs/screenshots/analyze.png) **Analyze** — live pipeline checklist over Supabase Realtime |
| ![Result](docs/screenshots/result.png) **Result** — verdict gauge + exact log-odds contributions | ![Indicators](docs/screenshots/indicators.png) **Indicator table** — measured value vs. expected range |
| ![Heatmap](docs/screenshots/heatmap.png) **Heatmap viewer** — original ↔ CAM overlay slider | ![Archive](docs/screenshots/archive.png) **Evidence gallery** — landscape scroller with filters |
| ![Live](docs/screenshots/live.png) **Live Monitor** — rolling 3-second windows | ![Model card](docs/screenshots/model-card.png) **Model Card** — metrics from `model_registry` |
| ![PDF](docs/screenshots/pdf.png) **PDF report** — custody table + QR verification | ![Verify](docs/screenshots/verify.png) **Verify** — public hash lookup |

---

## 5. Architecture

Three processes that share **nothing** except Supabase and a shared secret.

```
                      ┌──────────────────────────────────────────────┐
                      │                  BROWSER                     │
                      │  Next.js 14 UI · SHA-256 via Web Crypto      │
                      └───────┬──────────────────────────┬───────────┘
                              │                          │
              signed upload   │                          │  Realtime (websocket)
              (direct, never  │                          │  case_events + cases
               through our    ▼                          ▼
               server)  ┌─────────────────────────────────────────────┐
                        │              SUPABASE                       │
                        │  Postgres (RLS)  ·  Auth  ·  Storage        │
                        │  Realtime        ·  model_registry          │
                        └───▲─────────────────────────▲───────────────┘
                            │                         │
         service-role key   │                         │  service-role key
         (download media,   │                         │  (publish ONNX models
          write results)    │                         │   + metrics)
                            │                         │
   ┌────────────────────────┴──────┐   ┌──────────────┴─────────────────────┐
   │      DETECTION ENGINE          │   │        TRAINING PIPELINE           │
   │      FastAPI · Python 3.11     │   │        PyTorch · 10 stages         │
   │                                │   │                                    │
   │  ONNX Runtime · OpenCV         │   │  prepare → extract → finetune_face │
   │  MediaPipe · librosa · Praat   │   │  → univfd_probe → finetune_audio   │
   │  ffmpeg                        │   │  → export → handcrafted_features   │
   │                                │   │  → train_fusion → evaluate         │
   │  :7860  (localhost or tunnel)  │   │  → publish                         │
   └────────────────────────▲───────┘   └────────────────────────────────────┘
                            │
                            │  HTTPS + x-engine-secret
                            │  POST /analyze → 202 (async)
   ┌────────────────────────┴──────────────────────────────────────────────┐
   │   NEXT.JS SERVER ROUTES  (Vercel)                                     │
   │   auth · cases · artifacts/sign · Groq (report/summary/chat)          │
   │   PDF render · public API v1 · live session orchestration             │
   │   ── holds the service-role key and the Groq key; never the browser ──│
   └───────────────────────────────────────────────────────────────────────┘
```

**Key design decisions and why:**

| Decision | Reason |
|---|---|
| Engine is a **separate process**, not a Next.js route | OpenCV + MediaPipe + librosa + ONNX exceed Vercel's serverless bundle and 60 s execution limits |
| Uploads go **browser → Storage directly** via signed URL | Vercel request bodies cap at ~4.5 MB; this bypasses the server entirely |
| `POST /analyze` returns **202 immediately** | Analysis takes seconds to minutes; the engine works in a background thread and streams progress rows |
| Progress via **Supabase Realtime**, not polling | The checklist animates live; a 5 s poll runs *only* if the websocket channel errors |
| **Models are data**, not code | The engine reads `is_active` rows from `model_registry` at startup and re-checks every 10 minutes — publish a new version and the live system updates with **no redeploy** |
| Secrets are **server-only** | Service-role and Groq keys live in Vercel server env and the engine's `.env`; only the Supabase URL and anon key are `NEXT_PUBLIC_*` |

---

## 6. The life of one uploaded file

```
1. BROWSER          SHA-256 computed locally (Web Crypto) before anything is uploaded
2. POST /api/cases  → server inserts a queued case row, returns a signed upload URL
3. BROWSER          PUT file straight to Supabase Storage (XHR, real progress bar)
4. POST .../analyze → server verifies the object exists, calls the engine
5. ENGINE           202 Accepted, work begins in a background thread
6. ENGINE           writes one case_events row per step  ──► Realtime ──► live checklist
7. ENGINE           writes verdict + indicators + contributions + artifact paths
8. BROWSER          signs the private overlay paths, renders the staged result reveal
```

### The 11 pipeline steps, in plain words

| Step | What actually happens | Why it matters |
|---|---|---|
| **Ingest & download** | Engine pulls the file from Storage, enforces the size cap | Starts the custody trail |
| **SHA-256 + pHash** | SHA-256 = 64-char fingerprint of the exact bytes (one bit changes → completely different hash). pHash = 64-bit *perceptual* hash from a DCT, stays similar for visually similar images | SHA-256 proves the exact file; pHash finds near-duplicates of earlier cases |
| **Metadata & provenance** | EXIF/XMP (camera, software, timestamps), PNG text chunks (Stable Diffusion / ComfyUI store prompts there), embedded-thumbnail mismatch, C2PA Content Credentials | Cheapest and strongest evidence when present — AI tools often *admit* it in the file |
| **Modality routing** | Decides image / video / video+audio / audio; marks everything else not-applicable | Prevents fake certainty about things never measured |
| **Image detectors** | Face CNN, CLIP detector, frequency spectrum, blending boundary, ELA, noise residual, lighting | The still-image battery |
| **Per-frame face CNN** | 32 frames sampled across the clip, face cropped and scored, CAM heatmap per frame | Produces a timeline, not one number |
| **Temporal & biological** | One tracking pass at ≤15 fps: landmarks, blink, pulse, lip-sync | The signals a generator struggles to fake |
| **Audio anti-spoofing** | AASIST-L on 4 s windows, spectral band-limiting, prosody, breath, splice | Catches voice clones |
| **Evidence fusion** | 20 indicators → one probability with exact contributions | The core |
| **Artifacts upload** | Heatmaps, plots, thumbnails → private Storage | Evidence images for the report and PDF |
| **Finalize & custody seal** | Case row written with timestamps and model versions | Makes the case reproducible |

---

## 7. The 20 forensic indicators

### Learned models (3)

| Indicator | Model | Trained on | Output |
|---|---|---|---|
| `face_cnn` | EfficientNet-B4 (DeepfakeBench) | Face swaps / reenactment | Fake logit + 8×8 CAM |
| `univfd` | CLIP ViT-L/14 + linear probe | Real photos vs. GAN images | Fake logit + 5×5 occlusion map |
| `aasist` | AASIST-L graph attention on raw waveform | ASVspoof 2019 LA | Spoof score per 4 s window |

### Image physics (6)

| Indicator | What it measures |
|---|---|
| `freq_spectrum` | Natural photos follow a ~1/f² power law; GAN/diffusion upsampling leaves periodic peaks and a wrong slope |
| `blend_boundary` | A swapped face is pasted — sharpness and noise differ across the mask edge |
| `ela` | Error Level Analysis: re-save at JPEG q=90 and subtract; edited regions compress differently |
| `noise_residual` | Sensor noise is uniform across a real photo; pasted regions break that statistic |
| `lighting` | Lambertian fit of face-mesh normals → light direction; two faces lit differently is suspicious (heuristic, low weight) |
| `duplicate` | pHash Hamming distance to your earlier cases — *informational, never fused* |

### Video / biological (5)

| Indicator | What it measures |
|---|---|
| `landmark_jitter` | Second-difference RMS of landmarks after Procrustes pose removal — generated faces flicker |
| `blink` | Eye-aspect-ratio curve → rate and duration vs. the human range |
| `rppg` | **Pulse from skin colour** (POS projection, 0.7–4 Hz band-pass) across forehead + both cheeks; checks cross-ROI coherence. Needs ≥5 s of tracked face |
| `av_sync` | Cross-correlation of mouth aperture against audio RMS envelope; lip-sync fakes drift |
| `container` | ffprobe: editor signatures (Premiere, CapCut, ElevenLabs), re-encode traces, frame-interval irregularity |

### Audio (4 besides AASIST)

| Indicator | What it measures |
|---|---|
| `audio_spectral` | Vocoders low-pass their output — finds the cliff and distinguishes it from ordinary codec cutoff |
| `prosody` | Praat: F0 variability, local jitter, local shimmer, harmonics-to-noise ratio |
| `breath_pause` | Inhalation-like broadband segments between phrases; pause regularity |
| `splice` | Spectral-centroid jumps and phase-advance deviation where audio was cut and joined |

### Provenance (2)

| Indicator | What it measures |
|---|---|
| `exif_metadata` | Camera tags, editor software, generator parameter chunks, timestamp inconsistency, thumbnail mismatch |
| `c2pa` | Cryptographically signed Content Credentials — the emerging industry provenance standard |

---

## 8. The fusion model — exact explanations

Two layers, both **linear in log-odds**.

> **Log-odds (logit)** is probability on a different scale: `logit(p) = ln(p / (1−p))`.
> 0.5 → 0, 0.9 → ≈ +2.2, 0.1 → ≈ −2.2.
> **Why it matters:** probabilities do not add; log-odds do. That single property is what makes the
> explanation exact.

**Layer 1 — per-indicator calibrator.** Raw measurements become a suspicion score:

```
score_i = sigmoid( bias + Σ  weight_k · (measurement_k − centre_k) / scale_k )
```

*Example:* blink rate 4/min → deviation from the 8–21 range → suspicion 0.71.

**Layer 2 — fusion**, fitted separately per modality combo (`image`, `video`, `video_audio`, `audio`, `live`):

```
z = b + Σ ( w_i · clip(logit(score_i), ±8) · m_i  +  v_i · m_i )
p = sigmoid( a · z + β )                       ← Platt scaling
```

where `m_i` = 1 if indicator *i* was measurable, 0 if not.

**Each bar on the result page is exactly `a · w_i · logit(score_i)`, and they sum to the logit.**

**Verdict bands:** `Manipulated` if `p ≥ t_high`, `Authentic` if `p ≤ t_low`, `Inconclusive` between.
Thresholds are fitted on held-out validation data to hit a **5 % false-positive target** — not picked by hand.

### Why logistic regression and not a neural network for fusion?

A neural fusion head would destroy the one property that makes this project useful. A linear model in
log-odds is the **only** fusion where "contribution" has an exact, auditable meaning. We deliberately
traded a little accuracy for full explainability — which is the right trade for forensics.

---

## 9. What "uncalibrated defaults" means

Before the training pipeline runs, every weight, centre, scale and threshold is a value taken from the
literature — **not fitted to data**. So the percentage is a *weighted lean*, not a real probability.

PRAMAAN displays this state everywhere rather than hiding it:

- An amber banner on the Model Card naming the missing fusion version and what to run
- An amber pill on every case result
- "No local test metrics recorded" on each model card

After `train_fusion` fits at least one modality combo and `publish` registers it, the badge disappears
and the Model Card fills with AUC, EER, accuracy, F1, confusion matrix, reliability diagram and
per-indicator discrimination. If only *some* modalities have training data, the Model Card says exactly
which combos are calibrated and which are still on defaults.

---

## 10. Run it locally

### 10.1 Prerequisites

| Tool | Version | Windows | macOS / Linux |
|---|---|---|---|
| Node.js | 20 LTS | `winget install OpenJS.NodeJS.LTS` | `brew install node@20` |
| Python | **3.11** | `winget install Python.Python.3.11` | `brew install python@3.11` |
| ffmpeg | any recent | `winget install Gyan.FFmpeg` | `brew install ffmpeg` |
| Git | any | `winget install Git.Git` | preinstalled |

Close and reopen the terminal after installing so `PATH` updates. Verify:

```bash
node -v        # v20.x
py -3.11 -V    # Python 3.11.x   (macOS/Linux: python3.11 -V)
ffmpeg -version | head -1
```

Accounts needed: **Supabase** (free), **Groq** (free API key).

### 10.2 Supabase

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations/0001_init.sql
```

Then in the dashboard:
1. **SQL Editor** → paste `supabase/seed.sql` → Run (loads the 20-row indicator catalog).
2. **Project Settings → API** → copy the Project URL, the `anon` key and the `service_role` key.
3. **Authentication → URL Configuration** → Site URL `http://localhost:3000`, redirect URL
   `http://localhost:3000/auth/callback`.

> ⚠️ Supabase pauses free projects after ~1 week of inactivity. If sign-in or the engine fails, check the
> dashboard and click **Restore**.

### 10.3 Web app

```bash
cd web
npm install
cp .env.example .env.local      # fill in the values from Section 13
npm run dev                     # → http://localhost:3000
```

### 10.4 Engine

```bash
cd backend
py -3.11 -m pip install -r requirements.txt
cp .env.example .env            # fill SUPABASE_URL, SERVICE_ROLE_KEY, ENGINE_SHARED_SECRET
```

**First run only** — download the pretrained weights and publish them to your Supabase:

```bash
py -3.11 -m pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
py -3.11 -m pip install -r requirements-export.txt
py -3.11 scripts/fetch_pretrained.py          # add --quantize for INT8 (~4x smaller, faster on CPU)
py -3.11 scripts/publish_pretrained.py
```

This fetches the DeepfakeBench EfficientNet-B4 checkpoint (~71 MB), AASIST-L (~0.4 MB), the UnivFD probe
and the OpenAI CLIP ViT-L/14 tower (~1 GB via `open_clip`), exports them to ONNX, and uploads them to
Storage as version `0-pretrained` with `model_registry` rows.

**Every run:**

```bash
py -3.11 -m uvicorn app.main:app --port 7860
```

Wait for `loaded face_cnn@… univfd@… aasist@… fusion@…`, then check:

```bash
curl http://localhost:7860/health
```

> Port already in use? `netstat -ano | findstr :7860` then `taskkill /PID <pid> /F`
> (in Git Bash use `taskkill //PID <pid> //F`).

The Analyze page pill turns to **"Engine ready · 4/4 models loaded"** within ~3 seconds.

> 💡 **Warm-up:** the first analysis of a session is always the slowest because the ONNX sessions
> initialise on first use. Run one throwaway file before any demo.

---

## 11. Training pipeline

One command, ten resumable stages. Run **from the repository root**.

### 11.1 Dataset folder contract

```
datasets/
  image/real/<source-or-identity>/**.jpg|png|webp
  image/fake/<generator>/**
  video/real/<source>/**.mp4|avi|mov
  video/fake/<method>/**
  audio/real/<speaker>/**.wav|flac|mp3
  audio/fake/<system>/**
  (optional) audio/asvspoof2019_la/     ← official layout, protocol files read automatically
```

Keep **one identity or source per sub-folder**. The splitter groups by folder so the same person never
appears in both train and test — otherwise your metrics are inflated by leakage.

Check what you have:

```bash
py -3.11 -m training.download_datasets --data datasets
```

Sources, access procedures and exact placement: **`docs/DATASETS.md`**.

### 11.2 Install and train

```bash
py -3.11 -m pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cu121   # or /cpu
py -3.11 -m pip install -r training/requirements.txt
cp training/.env.example training/.env      # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

py -3.11 -m training.run_all --data datasets --modalities image --budget quick
```

### 11.3 The ten stages

| # | Stage | What it does |
|---|---|---|
| 1 | `prepare` | Scan datasets, SHA-256 dedupe, group-aware stratified 70/15/15 split; validation halved into `val_a` / `val_b` |
| 2 | `extract` | Detect and crop faces from images and sampled video frames |
| 3 | `finetune_face` | Fine-tune EfficientNet-B4 (quick mode freezes all but the last 6 MBConv blocks); best epoch by validation AUC — never worse than pretrained |
| 4 | `train_univfd_probe` | Cache CLIP embeddings once, fit the logistic probe, pick `C` on validation |
| 5 | `finetune_audio` | Fine-tune AASIST-L (head only in quick mode) with class-weighted loss |
| 6 | `export` | ONNX export at opset 17; **INT8 kept only if validation AUC drops < 1 point** |
| 7 | `handcrafted_features` | Runs the **engine's own** `analyze_file()` over val/test — so training and serving compute features with identical code (no train/serve skew) |
| 8 | `train_fusion` | Indicator calibrators + per-combo logistic fusion on `val_a`; Platt scaling, thresholds and reliability on `val_b` |
| 9 | `evaluate` | Test split through the engine's own `fuse()`: AUC, EER, accuracy, F1, confusion, ECE, per-indicator AUC |
| 10 | `publish` | Chunked upload to Storage + `model_registry` rows + activation + engine reload ping |

**Resumable:** re-run the same command and finished stages are skipped (`.done.json` markers).
Redo one: `--force train_fusion`. Redo everything: `--force all`.

### 11.4 Reading the results

```bash
cat training/runs/default/evaluate/evaluation.json      # AUC, EER, confusion, reliability
cat training/runs/default/train_fusion/.done.json       # per-combo: calibrated, or why not
```

- `auc` ≥ ~0.85 and `eer` ≤ ~0.2 → usable. Near 0.5 → the data or the split is broken.
- `per_indicator_auc` — anything below 0.55 contributes little on this data (expected for heuristics).
- `verdict_bands` — how many test items land in *Inconclusive*.
- `ece` — calibration error; this is what the "calibrated" claim rests on.

Free-GPU alternative (Kaggle / Colab): **`training/notebooks/kaggle_or_colab.md`**.

---

## 12. Repository structure

```
pramaan/
├── README.md  RUN_GUIDE.md  CHECKLIST.md  LICENSE  .gitignore
│
├── docs/
│   ├── TECHNICAL_OVERVIEW.md    how everything works, in depth
│   ├── PRESENTATION.md          demo script + Q&A + glossary
│   ├── ARCHITECTURE.md          component and security design
│   ├── ALGORITHMS.md            every indicator's maths
│   ├── DATASETS.md              sources, access, placement
│   ├── API.md                   public REST API reference
│   ├── NEXT_STEPS.md            datasets → training → deployment
│   ├── DEPLOY_TUNNEL.md         public deployment via ngrok
│   ├── DECISIONS.md             29 recorded design decisions
│   ├── DEMO_SCRIPT.md           5-minute demo flow
│   └── FILE_MANIFEST.md         every file in the repo
│
├── web/                         Next.js 14 (App Router, TypeScript strict)
│   ├── src/app/
│   │   ├── (marketing)/         landing, verify, model card, API docs
│   │   ├── (app)/               analyze, cases, archive, live, keys, settings
│   │   └── api/                 cases, Groq routes, PDF, artifacts, v1 public API
│   ├── src/components/
│   │   ├── ui/                  FadeIn, Magnet, AnimatedText, ContactButton, Marquee…
│   │   ├── three/               R3F scan face + corner objects (all ssr:false)
│   │   ├── analyze/ result/ archive/ live/ charts/ model/ keys/ verify/
│   ├── src/lib/                 supabase clients, groq, engine client, hashing,
│   │                            validators, grounding validator, pdf/
│   └── src/config/site.ts       ← the product name lives here, and only here
│
├── backend/                     FastAPI detection engine
│   ├── Dockerfile               python:3.11-slim + ffmpeg, port 7860
│   ├── app/
│   │   ├── main.py  config.py  supabase_io.py
│   │   ├── api/                 analyze, live, health
│   │   ├── pipeline/
│   │   │   ├── run.py           case orchestration
│   │   │   ├── analyze_local.py shared by engine AND training
│   │   │   ├── image/ video/ audio/ metadata/ fusion/
│   │   │   └── artifacts.py plots.py faces.py media.py scoring.py
│   │   └── models/              loader.py registry.py onnx_models.py
│   └── scripts/                 fetch_pretrained.py  publish_pretrained.py
│
├── training/
│   ├── run_all.py  config.yaml  common.py  torch_data.py
│   ├── models/                  face_net.py  univfd.py  aasist.py (vendored, MIT)
│   ├── stages/                  the 10 stages
│   └── notebooks/kaggle_or_colab.md
│
├── supabase/
│   ├── migrations/0001_init.sql tables, RLS, RPCs, buckets, realtime
│   └── seed.sql                 indicator catalog (reference rows only)
│
└── scripts/
    ├── deploy_engine.py         Hugging Face Space deployment
    ├── deploy_engine.sh         git-push alternative
    └── tunnel_engine.sh         ngrok public tunnel
```

---

## 13. Environment variables

### `web/.env.local`

| Variable | Example / note |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` — **this is what the PDF QR code points at** |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only, never prefixed `NEXT_PUBLIC_` |
| `GROQ_API_KEY` | from console.groq.com |
| `GROQ_MODEL` | default `openai/gpt-oss-120b` — verify it is current |
| `ENGINE_URL` | `http://localhost:7860` (or your tunnel URL) |
| `ENGINE_SHARED_SECRET` | long random string, **identical** to `backend/.env` |
| `MAX_UPLOAD_MB` | `50` |
| `API_FREE_MONTHLY_QUOTA` | `50` |

Generate the shared secret: `py -3.11 -c "import secrets; print(secrets.token_urlsafe(48))"`

### `backend/.env`

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENGINE_SHARED_SECRET`, `ALLOWED_ORIGINS`,
`MODEL_CACHE_DIR`, `MAX_VIDEO_SECONDS`, `VIDEO_SAMPLE_FRAMES`, `UNIVFD_OCCLUSION_GRID`,
`LIVE_SAMPLE_FRAMES`, `LIVE_TEMPORAL_FPS`, `MAX_CONCURRENT_JOBS`

### `training/.env`

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `ENGINE_URL` + `ENGINE_SHARED_SECRET`
so the engine reloads models the moment publishing finishes.

> **Never commit `.env` files.** `.gitignore` already excludes them; only `.env.example` is tracked.

---

## 14. Database & storage

**Tables:** `profiles`, `cases`, `case_events`, `chat_messages`, `live_sessions`, `live_windows`,
`api_keys`, `api_usage`, `model_registry`, `indicator_catalog`.

**Row-level security** — every table restricts rows to `user_id = auth.uid()`. Beyond that, **column-level
grants** stop a client from writing verdicts, scores, quotas or roles:

```sql
grant insert (user_id, media_type, source, filename, mime_type, preset, file_path,
              client_sha256, file_size, duration_s, parent_case_id) on public.cases to authenticated;
grant update (is_shareable, is_public_showcase) on public.cases to authenticated;
```

API keys can only be minted by the server (client `INSERT` is revoked), so a user cannot choose their own
quota or key hash.

**Security-definer RPCs:**

| RPC | Purpose |
|---|---|
| `verify_hash(sha256)` | Public verification — returns verdict + timestamps only, only for shareable completed cases |
| `public_showcase(limit)` | Landing-page showcase, owner-flagged cases only |
| `increment_api_usage(key, period, limit)` | Atomic quota consumption — **service_role only** |
| `my_case_stats()` | Aggregate dashboard stats, security-invoker so RLS applies |

**Buckets** (all private): `media-uploads`, `overlays`, `models`, `live-chunks` (24 h auto-sweep), `reports`.
Overlays are served through short-lived signed URLs after an ownership check.

---

## 15. Public REST API

```bash
# submit
curl -X POST https://<your-domain>/api/v1/analyze \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"media_url": "https://example.org/clip.mp4"}'
# → 202 { "case_id": "...", "status": "queued" }

# or multipart (≤ 4 MB, Vercel body limit)
curl -X POST https://<your-domain>/api/v1/analyze \
  -H "Authorization: Bearer pk_your_key" -F "file=@photo.jpg"

# poll
curl https://<your-domain>/api/v1/cases/<case_id> -H "Authorization: Bearer pk_your_key"

# PDF
curl -o report.pdf https://<your-domain>/api/v1/cases/<case_id>/report.pdf \
  -H "Authorization: Bearer pk_your_key"
```

Keys are `pk_` + 256 bits of randomness, stored as **SHA-256 with a 12-char display prefix** — the
plaintext is shown exactly once. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset`. Only `POST /analyze` consumes quota. Full reference: **`docs/API.md`**, interactive
page at `/docs/api`.

---

## 16. Tech stack and why each piece

| Layer | Choice | Why |
|---|---|---|
| Frontend + server routes | **Next.js 14** (App Router, TS strict) | One framework for UI and server; server routes keep the service-role and Groq keys off the browser |
| Backend-as-a-service | **Supabase** | Postgres + RLS + Auth + Storage + Realtime in one free project. RLS means isolation is enforced by the *database*, not by our code |
| Detection engine | **FastAPI** | Async API, background threads, trivial Docker image |
| Inference | **ONNX Runtime** (not PyTorch) | Much smaller image, faster CPU inference; PyTorch is only needed on the training machine |
| Face analysis | **MediaPipe** 0.10.14 | Fast CPU face detection + 468-point mesh, which every biological indicator depends on |
| Audio | **librosa** + **praat-parselmouth** | Praat is the standard in phonetics research, so prosody numbers are comparable to published work |
| 3D | **three.js + R3F 8 + drei 9** | Landing hero and visual identity. React pinned to 18.2 — R3F 8 breaks on React 19 internals |
| LLM | **Groq** (`groq-sdk`) | Very fast inference; and since it only ever sees the case JSON, it adds no hallucination risk to detection |
| Fusion | **L2 logistic regression** | The only model where contributions are exact and auditable |
| PDF | **@react-pdf/renderer** + `qrcode` | Court-style report generated server-side with the custody table |

---

## 17. Why the engine is not deployed, and how to deploy it

### 17.1 The honest reasons

**1. The engine is genuinely heavy.**
ONNX sessions for CLIP ViT-L/14 (~1.1 GB model file) + EfficientNet-B4 + AASIST-L, with MediaPipe, OpenCV
and librosa loaded, need roughly **1.5–2 GB RAM** and real CPU. A single video case runs 32 CNN forward
passes plus a ≤15 fps face-tracking pass over the whole clip.

**2. Our original target became paid.**
The project was built for **Hugging Face Docker Spaces** — the `Dockerfile`, `scripts/deploy_engine.py`
and `scripts/deploy_engine.sh` are all in this repo and work. Hugging Face now requires a paid plan to
*create* Docker or Gradio Spaces; only static Spaces remain free on personal accounts:

```
402 Payment Required — Static Spaces are free for everyone, but hosting Gradio and
Docker Spaces on free cpu-basic requires a PRO subscription.
```

**3. Free container tiers are too small.**
Render and Koyeb free instances cap at **512 MB RAM** — not enough to even load the CLIP model, let alone
decode video.

**4. Serverless does not fit the architecture.**
The engine answers `202` and keeps working in a background thread. Google Cloud Run **freezes CPU when the
request ends** unless you pay for an always-on instance. Vercel functions cap at 60 s and cannot carry the
ML dependencies at all.

**5. Local is genuinely better here.**
On a laptop a case finishes in seconds instead of minutes on 2 shared vCPUs — and the evidence never
leaves the machine, which is exactly what a police cyber cell or a newsroom would require anyway.
**On-premise is a feature in forensics, not a compromise.**

**6. It is deployment-*ready*, not undeployed.** Three scripts ship in this repo. Going public is a paid
plan or one command — not a rewrite.

### 17.2 Option A — ngrok tunnel (free, works today) ⭐ recommended

The Vercel frontend stays public; the engine runs on your machine behind a stable HTTPS URL.

```
visitor → https://pramaan-sage-six.vercel.app  →  https://<you>.ngrok-free.app  →  your laptop :7860
                       └────────► Supabase (auth, rows, storage, realtime)
```

```bash
# once
winget install ngrok.ngrok           # macOS: brew install ngrok
ngrok config add-authtoken <token>
# dashboard → Universal Edge → Domains → + New Domain  (free accounts get one static domain)

# every session — two terminals
cd backend && py -3.11 -m uvicorn app.main:app --port 7860     # terminal 1
bash scripts/tunnel_engine.sh pramaan-engine.ngrok-free.app     # terminal 2

curl https://pramaan-engine.ngrok-free.app/health               # verify
```

Then set `ENGINE_URL=https://pramaan-engine.ngrok-free.app` in Vercel and redeploy.
**Trade-off:** your machine must be on and online. Full guide: **`docs/DEPLOY_TUNNEL.md`**.

### 17.3 Option B — Hugging Face PRO ($9/month, laptop-independent)

Zero code changes; everything in this repo already targets it.

```bash
pip install -U huggingface_hub
hf auth login                        # WRITE token
py -3.11 scripts/deploy_engine.py --space <hf-username>/pramaan-engine
```

The script creates the Docker Space, sets the secrets from `backend/.env`, uploads `backend/`, and waits
for the build. Then `ENGINE_URL=https://<hf-username>-pramaan-engine.hf.space`.
Keep the Space **public** — every route except `/health` requires the shared secret.

### 17.4 Option C — Google Cloud Run

Works, but the background-thread design needs an always-on instance:

```bash
gcloud run deploy pramaan-engine --source backend \
  --memory 4Gi --cpu 2 --port 7860 \
  --no-cpu-throttling --min-instances 1 \
  --set-env-vars "SUPABASE_URL=...,ENGINE_SHARED_SECRET=..."
```

`--min-instances 1` means it is **not** free, but it is cheap and always available.

### 17.5 Option D — any VPS with 2 GB RAM

DigitalOcean, Hetzner, Oracle Cloud Free Tier (ARM Ampere gives 24 GB RAM free):

```bash
docker build -t pramaan-engine ./backend
docker run -d -p 7860:7860 --env-file backend/.env --restart unless-stopped pramaan-engine
```

Put Caddy or nginx in front for HTTPS, then point `ENGINE_URL` at it.

### 17.6 Deploying the frontend (already done, for reference)

```bash
npm i -g vercel && vercel login
cd web && vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production          # ← the PDF QR code URL
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add GROQ_API_KEY production
vercel env add GROQ_MODEL production
vercel env add ENGINE_URL production
vercel env add ENGINE_SHARED_SECRET production
vercel env add MAX_UPLOAD_MB production
vercel env add API_FREE_MONTHLY_QUOTA production
vercel --prod
```

Then add `https://<domain>/auth/callback` to Supabase → Authentication → URL Configuration.

> `NEXT_PUBLIC_*` values are **inlined at build time** — after changing `NEXT_PUBLIC_SITE_URL` you must
> run `vercel --prod` again, and re-download any PDF whose QR should point at the public domain.

---

## 18. Limitations — read this honestly

- **Results are only as good as the training data.** Ship-time models are pretrained on public datasets
  (FaceForensics++-era face swaps, ProGAN-era GAN images, ASVspoof 2019 speech). Modern diffusion output
  sits outside that distribution. Train on your own data — Section 11.
- **Compression is a real adversary.** WhatsApp and Instagram re-encode aggressively, which weakens ELA,
  noise residual, frequency and blending cues. Include compressed copies in training data.
- **A still, well-lit, well-made deepfake defeats motion cues.** rPPG, blink and jitter need movement and
  a visible face over time.
- **`face_cnn` is a face-swap detector.** A fully generated scene with no face gives it nothing — it
  correctly returns `not_applicable` rather than guessing.
- **Small test splits mean wide error bars.** The Model Card shows the split size next to every metric for
  exactly this reason.
- **This is decision support, not proof.** Every report says so. A qualified examiner must corroborate
  before any consequential decision.

---

## 19. Documentation index

| Document | Read it for |
|---|---|
| **`docs/TECHNICAL_OVERVIEW.md`** | How everything works, in depth — processes, case lifecycle, every model, the fusion maths, speed, security |
| **`docs/PRESENTATION.md`** | Demo script, judge Q&A, glossary, pre-demo checklist |
| **`RUN_GUIDE.md`** | Step-by-step setup, Windows Git Bash first |
| **`docs/NEXT_STEPS.md`** | Datasets → training → deployment, with timings |
| **`docs/ALGORITHMS.md`** | The mathematics of every indicator |
| **`docs/ARCHITECTURE.md`** | Component design, security model, case lifecycle |
| **`docs/DATASETS.md`** | Where to get data and exactly where to put it |
| **`docs/API.md`** | Public REST API reference |
| **`docs/DEPLOY_TUNNEL.md`** | Public deployment via ngrok |
| **`docs/DECISIONS.md`** | 29 recorded design decisions and deviations, with reasons |

---

## 20. References and credits

Research and code this project learns from (no code copied except where noted in `LICENSE`):

- **SCLBD/DeepfakeBench** — EfficientNet-B4 detector + pretrained checkpoint (Yan et al., NeurIPS 2023 D&B)
- **clovaai/aasist** — AASIST / AASIST-L anti-spoofing (Jung et al., ICASSP 2022) · model code vendored under MIT
- **Yuheng-Li/UniversalFakeDetect** — UnivFD CLIP linear probe (Ojha, Li & Lee, CVPR 2023)
- **yuezunli/CVPRW2019_Face_Artifacts** — face warping artifacts (Li & Lyu, CVPRW 2019)
- **selimsef/dfdc_deepfake_challenge** — DFDC winning solution
- **nii-yamagishilab/Capsule-Forensics-v2** — capsule networks for forgery detection
- **RUB-SysSec/WaveFake** — vocoder artefacts in synthetic speech (Frank & Schönherr, NeurIPS 2021 D&B)
- **media-sec-lab/Audio-Deepfake-Detection** — audio deepfake detection survey
- **Intel FakeCatcher** (Ciftci, Demir & Yin, TPAMI 2020) and **POS rPPG** (Wang et al., IEEE TBME 2017)
- **DeepFake-o-meter v2.0** (arXiv 2404.13146) — multiple detectors behind one interface
- **google/mediapipe** — face detection, face mesh, canonical face model (Apache-2.0)
- Durall et al. 2020 · Frank et al. ICML 2020 · Krawetz 2007 · Mahdian & Saic 2009 · Johnson & Farid 2005 ·
  Soukupová & Čech 2016 · Chung & Zisserman ACCVW 2016 · Boersma 1993 · C2PA Technical Specification 2.x

Information-architecture references only: Reality Defender, Sensity AI, Hive Moderation,
Microsoft Video Authenticator, Deepware Scanner.

---

## 21. License

MIT — see [`LICENSE`](LICENSE) for third-party components.

`training/models/aasist.py` is © NAVER Corp. (MIT), vendored unchanged.
`web/public/canonical-face-mesh.json` is derived from MediaPipe's canonical face model (Apache-2.0).
Pretrained weights downloaded by `backend/scripts/fetch_pretrained.py` and the datasets in
`docs/DATASETS.md` are **not** covered by this license — each is subject to its publisher's terms.

---

<div align="center">

**Detection you can defend.**

[Live frontend](https://pramaan-sage-six.vercel.app/) · [Technical overview](docs/TECHNICAL_OVERVIEW.md) · [Run guide](RUN_GUIDE.md)

</div>
