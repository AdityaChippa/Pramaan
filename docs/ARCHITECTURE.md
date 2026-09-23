# Architecture

```
Browser ──► Vercel (Next.js 14: pages + API routes: auth, cases, Groq, PDF, v1 API, live)
   │              │  x-engine-secret over HTTPS
   │ signed upload ▼
   ▼        Hugging Face Docker Space — FastAPI engine (CPU, port 7860)
Supabase ◄──────── service role: download media, write case_events/cases, upload overlays, read models
(Postgres · Auth · Storage · Realtime)
   ▲
Training (laptop / Colab / Kaggle) ── publishes ONNX + fusion.json + metrics to Storage + model_registry
```

## Components
| Layer | Location | Responsibility |
|---|---|---|
| Web | `web/` | Landing (R3F scan face), auth, analyze flow, result page, archive dome, live monitor, keys, docs, model card, verify. API routes authenticate the session (Supabase SSR cookies) or an API key, enforce ownership, then call the engine or Groq. |
| Database | `supabase/migrations/0001_init.sql` | Tables, column-level grants, RLS, RPCs (`verify_hash`, `public_showcase`, `increment_api_usage`, `my_case_stats`), realtime publication, private buckets with per-user prefix policies. |
| Engine | `backend/app` | `api/` (analyze, live, health) → `pipeline/run.py` orchestration → modality pipelines → `fusion/` → `artifacts.py`. `models/loader.py` downloads active registry versions and verifies SHA-256. |
| Training | `training/` | Ten resumable stages; imports `backend/app` so features are computed by the same code the engine runs. |

## Case lifecycle
1. Browser computes SHA-256 (Web Crypto), `POST /api/cases` → server inserts a `queued` case with the service role and returns a signed upload URL for `media-uploads/<user>/<case>/<file>`.
2. Browser uploads directly to Storage (XHR progress), then `POST /api/cases/:id/analyze` → server checks the object exists and calls engine `POST /analyze` (202).
3. Browser subscribes to Realtime `case_events` + `cases` for that id (5 s poll only if the channel errors).
4. Engine thread: `ingest` (download, size check) → `hash` (SHA-256 recomputed; mismatch with the browser hash fails the case) → `metadata` → `routing` → `image_detectors` or `video_frames` + `video_temporal` → `audio` → `fusion` → `artifacts_upload` (PNGs to `overlays/<user>/<case>/`) → `finalize`. Each step is a `case_events` row with timestamps and a JSON detail — the live progress feed and the custody log.
5. Any indicator exception becomes `status: "error"` with the message; fusion masks it out.
6. Result page reads the row (RLS), signs overlay paths via `/api/artifacts/sign`, renders the staged reveal.

## Live monitor
MediaRecorder is restarted every 3 s so each chunk is a standalone WebM → signed upload to `live-chunks/<user>/<session>/<n>.webm` → `/api/live/analyze` → engine `/live/analyze` (face CNN on 4 frames, jitter, blink, AASIST-L) → `live_windows` row + response. Stop → `/live/finalize` aggregates windows (mean log-odds per indicator, `live` fusion combo) into a `source=live` case with a `live_aggregate` custody event containing every chunk hash. Chunks older than 24 h are deleted by the engine at startup and hourly.

## Models are data
`model_registry(name, version, storage_path, metrics, dataset_stats, config, thresholds, calibrated, is_active)`; one active row per name (`face_cnn`, `univfd`, `aasist`, `fusion`). Files live under `models/<name>/<version>/` with `manifest.json` (per-file SHA-256, optional 45 MB parts). The engine loads active versions at startup, re-checks every 10 minutes and on `POST /models/reload`.

## Security
- Service-role key and Groq key only in Vercel server env, HF Space secrets and local `.env`.
- Users cannot write verdicts, scores or artifacts: column grants limit client inserts/updates on `cases` to request fields and sharing toggles; API keys and profile roles are server-managed.
- Buckets are private; overlays are served through short-lived signed URLs after an ownership check.
- URL ingest resolves DNS and rejects private/reserved ranges on every redirect hop, enforces content-type and a streaming byte cap.
- API keys: `pk_` + 256-bit random, stored as SHA-256 with a 12-char display prefix; atomic quota RPC callable only by the service role.
- Groq routes receive only the stored case JSON; a validator rejects numbers that are not in it (one regeneration, then `grounding_warning`).
