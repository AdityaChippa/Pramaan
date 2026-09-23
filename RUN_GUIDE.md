# PRAMAAN — Run Guide

Every command is copy-paste ready. **Windows 11 + Git Bash (MINGW64)** comes first (`py` launcher);
**macOS/Linux** equivalents follow (`python3`). Run commands from the repository root unless a step says `cd`.

Contents: 1 Prerequisites · 2 Open the project · 3 Supabase · 4 Web app locally · 5 Engine locally ·
6 Datasets · 7 Train and publish models · 8 Deploy the engine to Hugging Face · 9 Deploy the web app to Vercel ·
10 Post-deploy verification · 11 Troubleshooting

---

## 1. Prerequisites

| Tool | Version | Install (Windows) | Install (macOS / Linux) |
|---|---|---|---|
| Node.js | 20 LTS | `winget install OpenJS.NodeJS.LTS` | `brew install node@20` / nodesource or `nvm install 20` |
| Python | 3.11 | `winget install Python.Python.3.11` | `brew install python@3.11` / `sudo apt install python3.11 python3.11-venv` |
| Git | any recent | `winget install Git.Git` (includes Git Bash) | preinstalled / `brew install git` |
| ffmpeg | any recent | `winget install Gyan.FFmpeg` | `brew install ffmpeg` / `sudo apt install ffmpeg` |
| VS Code | any | `winget install Microsoft.VisualStudioCode` | code.visualstudio.com |

Accounts: Supabase, Groq (API key from console.groq.com), Hugging Face (access token with **write** scope from huggingface.co/settings/tokens), Vercel.

Check versions (close and reopen Git Bash after any winget install so PATH updates):

```bash
node -v          # v20.x
npm -v
py -3.11 --version    # Windows      → Python 3.11.x
python3 --version     # macOS/Linux  → Python 3.11.x
git --version
ffmpeg -version | head -1
ffprobe -version | head -1
```
Success: every command prints a version, none says "command not found".

## 2. Open the project

```bash
cd ~/Downloads            # wherever pramaan.zip was saved
unzip pramaan.zip -d .    # Windows alternative: right-click → Extract All
cd pramaan
code .
```
Success: VS Code opens with `web/`, `backend/`, `training/`, `supabase/`, `docs/` in the explorer.

## 3. Supabase setup

1. In the Supabase dashboard: **New project** → choose a region close to your users → save the database password.
2. Link and push the schema (the CLI runs through npx; no global install needed):

```bash
npx supabase login                               # opens the browser for an access token
npx supabase link --project-ref <your-project-ref>   # ref = the id in https://<ref>.supabase.co
npx supabase db push                             # applies supabase/migrations/0001_init.sql
```
Success: `Finished supabase db push.` Tables `cases`, `case_events`, … appear under **Table Editor**; buckets
`media-uploads`, `overlays`, `models`, `live-chunks`, `reports` appear under **Storage**.

3. Load the reference rows (indicator catalog — no case data): **SQL Editor → New query →** paste the contents of
`supabase/seed.sql` → **Run**. (If `npx supabase db push --help` on your CLI version lists `--include-seed`,
`npx supabase db push --include-seed` does the same.) Success: `indicator_catalog` has 20 rows.

4. Keys: **Project Settings → API** — copy **Project URL**, **anon public** key and **service_role** key.
   The service-role key is server-only: it goes into `web/.env.local` (no `NEXT_PUBLIC_` prefix), `backend/.env` and `training/.env`, never into browser code.

5. Auth: **Authentication → Sign In / Providers → Email** — keep Email enabled (password sign-in and magic links both use it).
   **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (change to the Vercel URL after §9)
   - Redirect URLs: `http://localhost:3000/auth/callback` and later `https://<your-vercel-domain>/auth/callback`

6. Realtime is enabled by the migration (publication on `cases`, `case_events`, `live_windows`). Nothing to click.

7. Storage limit: the free plan caps a single upload at 50 MB (**Storage → Settings → Upload file size limit**). The app's default `MAX_UPLOAD_MB=50` matches it; model files larger than this are uploaded in 45 MB parts automatically.

## 4. Web app locally

```bash
cd web
npm install
cp .env.example .env.local
```
Fill `web/.env.local`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `GROQ_API_KEY` | from console.groq.com |
| `GROQ_MODEL` | default `openai/gpt-oss-120b` — confirm it is listed at console.groq.com/docs/models and change if not |
| `ENGINE_URL` | `http://localhost:7860` (local engine) |
| `ENGINE_SHARED_SECRET` | a long random string, identical in `backend/.env` — generate with `py -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `MAX_UPLOAD_MB` | `50` |
| `API_FREE_MONTHLY_QUOTA` | `50` |

```bash
npm run dev
```
Success: `Ready` on http://localhost:3000. The landing page renders the scanning face; `/auth/sign-in` lets you create an account.
A missing variable produces an error naming it (e.g. `[env] Invalid server environment: GROQ_API_KEY: GROQ_API_KEY is missing`).

## 5. Engine locally

**Windows (Git Bash):**
```bash
cd backend
py -3.11 -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```
**macOS/Linux:**
```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```
Fill `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENGINE_SHARED_SECRET` (same as web), `ALLOWED_ORIGINS=http://localhost:3000`.

Build and publish the pretrained models (version `0-pretrained`). This needs PyTorch only on your machine — the Docker image never contains it:

```bash
# still inside backend/ with the venv active
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-export.txt
py scripts/fetch_pretrained.py          # macOS/Linux: python scripts/fetch_pretrained.py
py scripts/publish_pretrained.py
```
What happens: the DeepfakeBench EfficientNet-B4 checkpoint (≈71 MB), AASIST-L (≈0.4 MB), the UnivFD probe and the
OpenAI CLIP ViT-L/14 tower (downloaded by open_clip, roughly 1 GB) are fetched, exported to ONNX in `backend/pretrained/`,
loaded once with the engine's own loader, then uploaded to Storage `models/<name>/0-pretrained/` (large files in parts) with
`model_registry` rows. Success: `loaded: ['aasist', 'face_cnn', 'fusion', 'univfd'] errors: none`, then
`registered …@0-pretrained (active=True)` four times. The Model Card page now lists them with "Uncalibrated defaults".

Start the engine:
```bash
uvicorn app.main:app --port 7860 --reload
```
Success: `Uvicorn running on http://127.0.0.1:7860`, then `loaded face_cnn@0-pretrained` … in the log.
`curl http://localhost:7860/health` returns `{"status":"ok", "models": {"versions": {...}}}`. On the web analyze page the
status pill turns to "Engine ready · 4/4 models loaded".

## 6. Datasets

Folder contract (any source works):
```
datasets/
  image/{real,fake}/**.jpg|png|webp
  video/{real,fake}/**.mp4|avi|mov
  audio/{real,fake}/**.wav|flac|mp3
  (optional) audio/asvspoof2019_la/   official layout, auto-detected
```
Put each identity or source video in its own sub-folder (e.g. `video/fake/ffpp_Deepfakes/`) — the split is made by
group so the same person never appears in both train and test.

Sources, access procedure and exact placement are in `docs/DATASETS.md`. Print them plus a count of what you already have:
```bash
py -m training.download_datasets --data datasets      # macOS/Linux: python -m training.download_datasets --data datasets
```
Disk space: a `quick` run on a few thousand files needs the files themselves plus ≈2–5 GB of work space
(face crops, CLIP embedding cache, ONNX exports). Full public datasets range from a few GB (ASVspoof 2019 LA) to
hundreds of GB (DFDC); check each source page for current sizes.

## 7. Train and publish models

Training imports the engine's feature code, so it runs **from the repository root** with its own venv:

**Windows (Git Bash):**
```bash
py -3.11 -m venv training/.venv
source training/.venv/Scripts/activate
python -m pip install --upgrade pip
# NVIDIA GPU (CUDA 12.1 wheels):
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cu121
# …or CPU only:
# pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r training/requirements.txt
cp training/.env.example training/.env      # fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
py -m training.run_all --data datasets --modalities image,video,audio --budget quick
```
**macOS/Linux:** same with `python3.11 -m venv training/.venv`, `source training/.venv/bin/activate` and `python -m training.run_all …`.

Stages: prepare → extract → finetune_face → train_univfd_probe → finetune_audio → export → handcrafted_features →
train_fusion → evaluate → publish. Output lives in `training/runs/default/<stage>/`.

- **Resume**: re-run the same command; stages with a `.done.json` marker are skipped. Redo one: `--force train_fusion`; everything: `--force all`.
- **Only some modalities**: `--modalities audio`.
- **Without uploading**: `--no-publish`; publish later with `--force publish`.
- **Budget**: `quick` freezes early CNN blocks, trains the AASIST head only and caps items; `full` trains longer on everything (`training/config.yaml`).
- Success: `stage publish done`, `registered fusion@<version> (active=True)`. Metrics are in
  `training/runs/default/evaluate/evaluation.json` and on the **Model Card** page (`/model`). The engine reloads new
  versions within 10 minutes, or immediately if `ENGINE_URL` and `ENGINE_SHARED_SECRET` are set in `training/.env`.
- A modality without enough data keeps its current (pretrained) model; fusion combos without enough rows keep documented defaults and are shown as uncalibrated.

Free GPU alternative: `training/notebooks/kaggle_or_colab.md`.

## 8. Deploy the engine to Hugging Face Spaces (terminal)

Commands verified against `huggingface_hub` 1.32.0 (`hf` CLI).

```bash
pip install -U huggingface_hub
hf auth login                 # paste the WRITE token; older installs: huggingface-cli login
```
Set `ALLOWED_ORIGINS` in `backend/.env` to include your Vercel URL (comma-separated), then choose **one** path:

**A. Python script (creates the Space, sets secrets and variables, uploads, waits for the build):**
```bash
py scripts/deploy_engine.py --space <hf-username>/pramaan-engine
```
**B. git push (after creating the Space and setting secrets once via A or the dashboard):**
```bash
hf repos create <hf-username>/pramaan-engine --type space --sdk docker --exist-ok
hf auth login --add-to-git-credential
bash scripts/deploy_engine.sh <hf-username>/pramaan-engine
```
Secrets can also be set with `hf spaces secrets add <hf-username>/pramaan-engine -s SUPABASE_URL -s SUPABASE_SERVICE_ROLE_KEY -s ENGINE_SHARED_SECRET -s ALLOWED_ORIGINS`
(values are read from exported shell variables), or in the Space's **Settings → Variables and secrets**.

Keep the Space **public** (the Vercel server calls it over HTTPS; every route except `/health` requires the shared secret).
The first Docker build takes several minutes. Success:
```bash
curl https://<hf-username>-pramaan-engine.hf.space/health
```
returns `"status":"ok"` with model versions. Free CPU Spaces sleep after inactivity — the analyze page shows "Engine waking up · Ns".

## 9. Deploy the web app to Vercel (terminal)

```bash
npm i -g vercel
vercel login
cd web
vercel link                     # create/link a project; root directory = web
```
Add every variable for production (paste the value when prompted):
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production        # https://<your-project>.vercel.app
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add GROQ_API_KEY production
vercel env add GROQ_MODEL production
vercel env add ENGINE_URL production                   # https://<hf-username>-pramaan-engine.hf.space
vercel env add ENGINE_SHARED_SECRET production
vercel env add MAX_UPLOAD_MB production
vercel env add API_FREE_MONTHLY_QUOTA production
vercel --prod
```
Then:
1. Supabase → Authentication → URL Configuration: Site URL = your Vercel URL; add `https://<domain>/auth/callback` to Redirect URLs.
2. Make sure `ALLOWED_ORIGINS` on the Space includes the Vercel URL (re-run §8 A or edit the secret; the Space restarts).
3. If `NEXT_PUBLIC_SITE_URL` changed after the first deploy, run `vercel --prod` again (public variables are inlined at build time).

Success: `vercel --prod` prints `Production: https://…vercel.app`; the site loads and sign-in emails link back to it.

## 10. Post-deploy verification (manual)

1. Sign up, open **Analyze**, wait for "Engine ready".
2. Upload an authentic photo or video you recorded yourself → watch pipeline steps light up live → result page shows verdict, gauge with thresholds, contribution chart, indicator table with measured values.
3. Upload a known manipulated sample (e.g. from a dataset's fake split) → check heatmaps (slider/opacity), top frames, timelines.
4. Generate the executive summary and technical report; ask a question in the chat.
5. **Download PDF**; toggle **Shareable**; open `/verify`, drop the same file → the case is found. Change one byte → not found.
6. **Archive**: cards appear in the dome; click one → drawer; toggle cluster mode and grid view.
7. **Live**: start the monitor for ~20 s, stop → a session case is created.
8. **API**: create a key on **API Keys**, then
```bash
curl -X POST https://<domain>/api/v1/analyze -H "Authorization: Bearer pk_..." -F "file=@photo.jpg" -i
curl https://<domain>/api/v1/cases/<case_id> -H "Authorization: Bearer pk_..."
```
Expect `202` with `X-RateLimit-Remaining`, then the full JSON once `status` is `complete`.

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `TypeError: Cannot read properties of undefined (reading 'ReactCurrentOwner')` or hooks errors in 3D sections | Two React copies or React 19 installed. Keep `react`/`react-dom` 18.2.0 exactly (`npm ls react`); delete `web/node_modules` and `package-lock.json`, `npm install`. The webpack alias in `next.config.mjs` must remain. |
| Analyze page stuck on "Engine waking up" | Free Space sleeping or building. Open the Space page → Logs. Check `ENGINE_URL` has no trailing path and uses `https://<user>-<space>.hf.space`. |
| Engine log: `Engine configuration invalid or missing: SUPABASE_URL…` | Space secrets not set — §8. |
| `engine unavailable: engine responded 401` | `ENGINE_SHARED_SECRET` differs between Vercel and the Space. |
| CORS error calling the engine from a browser | The browser never calls the engine directly; if you added such a call, list the origin in `ALLOWED_ORIGINS`. |
| `new row violates row-level security policy` / empty lists | You are querying another user's rows or the migration didn't run; re-run `npx supabase db push`. Server routes that must bypass RLS use the service-role key — confirm `SUPABASE_SERVICE_ROLE_KEY` is set. |
| Upload fails with `413` / `Payload too large` | Supabase per-file limit (free 50 MB). Lower `MAX_UPLOAD_MB` or raise the project limit on a paid plan. Public API multipart is capped at 4 MB by Vercel — use `media_url`. |
| `ffmpeg not found` on Windows | `winget install Gyan.FFmpeg`, then **close and reopen Git Bash** (and VS Code). `where ffmpeg` must print a path. |
| `pip install mediapipe` fails on Windows | Use Python **3.11** 64-bit (`py -3.11`), not 3.12+/32-bit; upgrade pip first. |
| Groq `429` in report/chat | Rate limit on your Groq tier: wait and retry; the UI shows the message. Change `GROQ_MODEL` if the model was retired. |
| Model Card says "Not trained yet" | No active `model_registry` rows — run §5 `publish_pretrained.py` or §7. |
| Training stage failed | Fix the logged cause and re-run the same command; finished stages are skipped. Logs: `training/runs/default/training.log`. |
| Realtime updates don't arrive | The page falls back to a 5 s poll automatically. Check **Database → Publications → supabase_realtime** includes `cases`, `case_events`, `live_windows`. |
