# Running the PRAMAAN training pipeline on a free GPU (Kaggle or Colab)

Both environments give a CUDA GPU and Python 3.10/3.11. The pipeline is the same command as on a laptop.
Budget-wise: `--budget quick` finishes in well under a free session for a few thousand items.

## 1. Get the code

**Colab** (Runtime → Change runtime type → T4 GPU), new cell:
```bash
!git clone https://github.com/<you>/pramaan.git
%cd pramaan
```
Or upload `pramaan.zip` in the file panel and run `!unzip -q pramaan.zip && %cd pramaan`.

**Kaggle** (Settings → Accelerator → GPU; Internet on): same cells; working dir is `/kaggle/working`.

## 2. System packages and Python dependencies
```bash
!apt-get -qq update && apt-get -qq install -y ffmpeg libsndfile1 > /dev/null
!pip install -q torch==2.4.1 --index-url https://download.pytorch.org/whl/cu121
!pip install -q -r training/requirements.txt
!python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```
If pip reports a NumPy/OpenCV conflict with preinstalled notebook packages, restart the runtime once and re-run the cell.

## 3. Datasets
Attach or download datasets and arrange them in the folder contract (see `docs/DATASETS.md`):
```
datasets/image/{real,fake}/...   datasets/video/{real,fake}/...   datasets/audio/{real,fake}/...
```
On Kaggle, datasets added via "Add data" live under `/kaggle/input/<name>`; symlink them instead of copying:
```bash
!mkdir -p datasets/image/real datasets/image/fake
!ln -s /kaggle/input/<real-dataset-folder> datasets/image/real/src1
!ln -s /kaggle/input/<fake-dataset-folder> datasets/image/fake/src1
!python -m training.download_datasets --data datasets
```

## 4. Credentials for publishing
```python
import os
os.environ["SUPABASE_URL"] = "https://YOUR-PROJECT.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "..."   # Kaggle: Add-ons → Secrets; Colab: the key icon → userdata.get(...)
```

## 5. Train, evaluate, publish
```bash
!python -m training.run_all --data datasets --modalities image,video,audio --budget quick --work /kaggle/working/run1
```
Use `--work /content/run1` on Colab. If the session disconnects, run the same command again: finished stages are skipped.
To train without uploading: add `--no-publish`, then publish later with `--force publish` from any machine that has the work folder.

## 6. Results
- `run1/evaluate/evaluation.json` — test AUC, EER, confusion matrix, reliability bins.
- After publish, the Model Card page (`/model`) shows the new active versions; the engine reloads within 10 minutes
  (immediately if `ENGINE_URL` and `ENGINE_SHARED_SECRET` are set).
