---
title: PRAMAAN Engine
emoji: 🔎
colorFrom: purple
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Explainable deepfake & synthetic media forensic engine
---

# PRAMAAN inference engine

FastAPI service that runs the PRAMAAN forensic pipeline (image, video, audio, metadata),
fuses evidence with a calibrated logistic model and writes results to Supabase.

Endpoints (all except `/health` require header `X-Engine-Secret`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, loaded model versions, queue depth |
| POST | `/analyze` | `{ "case_id": uuid }` → 202, job runs asynchronously |
| POST | `/live/analyze` | `{ "session_id", "chunk_path", "chunk_index", "t_start" }` → window scores |
| POST | `/live/finalize` | `{ "session_id" }` → aggregates windows into a case |
| POST | `/models/reload` | Reload `is_active` models from `model_registry` |

Required Space secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENGINE_SHARED_SECRET`, `ALLOWED_ORIGINS`.
See the repository `RUN_GUIDE.md` §8.
