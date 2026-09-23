"""Shared helpers for the training pipeline: paths, config, stage bookkeeping, downloads, Supabase."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np
import yaml

TRAINING_DIR = Path(__file__).resolve().parent
REPO_ROOT = TRAINING_DIR.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))  # so `import app.*` resolves to the engine code (identical feature extraction)

log = logging.getLogger("pramaan.training")

LABELS = {"real": 0, "fake": 1}
MEDIA_EXT = {
    "image": {".jpg", ".jpeg", ".png", ".webp"},
    "video": {".mp4", ".avi", ".mov", ".webm", ".mkv"},
    "audio": {".wav", ".flac", ".mp3", ".ogg", ".m4a"},
}


def setup_logging(work: Path) -> None:
    work.mkdir(parents=True, exist_ok=True)
    fmt = "%(asctime)s %(levelname)s %(name)s: %(message)s"
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=[logging.StreamHandler(), logging.FileHandler(work / "training.log", encoding="utf-8")])


def load_env_file(path: Path = TRAINING_DIR / ".env") -> None:
    """Minimal KEY=VALUE loader (no extra dependency); existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def load_config(path: Path = TRAINING_DIR / "config.yaml") -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass


def device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path: Path, default: Any = None) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, default=_json_default), encoding="utf-8")
    tmp.replace(path)


def _json_default(o: Any) -> Any:
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"not JSON serialisable: {type(o)}")


def download(url: str, dest: Path, expected_size: int | None = None) -> Path:
    """Download once (resumable by skipping complete files); verifies byte size when known."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and (expected_size is None or dest.stat().st_size == expected_size):
        return dest
    tmp = dest.with_suffix(dest.suffix + ".part")
    log.info("downloading %s", url)
    req = urllib.request.Request(url, headers={"User-Agent": "pramaan-training/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, tmp.open("wb") as out:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        last = time.time()
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if time.time() - last > 5:
                log.info("  %.1f / %.1f MB", done / 1e6, total / 1e6)
                last = time.time()
    if expected_size is not None and tmp.stat().st_size != expected_size:
        size = tmp.stat().st_size
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"size mismatch for {url}: got {size}, expected {expected_size}")
    tmp.replace(dest)
    return dest


@dataclass
class Context:
    """Everything a stage needs. Each stage writes into work/<stage>/ and finishes with a .done marker."""

    data: Path
    work: Path
    modalities: list[str]
    budget: str
    cfg: dict[str, Any]
    force: set[str] = field(default_factory=set)

    @property
    def b(self) -> dict[str, Any]:
        return self.cfg["budgets"][self.budget]

    def stage_dir(self, name: str) -> Path:
        d = self.work / name
        d.mkdir(parents=True, exist_ok=True)
        return d

    def done_marker(self, name: str) -> Path:
        return self.stage_dir(name) / ".done.json"

    def is_done(self, name: str) -> bool:
        return name not in self.force and self.done_marker(name).exists()

    def mark_done(self, name: str, summary: dict[str, Any]) -> None:
        write_json(self.done_marker(name), {"finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "budget": self.budget, **summary})

    def summary(self, name: str) -> dict[str, Any]:
        return read_json(self.done_marker(name), {}) or {}

    def splits(self) -> dict[str, Any]:
        s = read_json(self.work / "prepare" / "splits.json")
        if s is None:
            raise RuntimeError("splits.json missing — run the prepare stage first")
        return s


def run_stage(ctx: Context, name: str, fn: Callable[[Context], dict[str, Any]]) -> dict[str, Any]:
    if ctx.is_done(name):
        log.info("stage %-22s skipped (output exists: %s)", name, ctx.done_marker(name))
        return ctx.summary(name)
    log.info("stage %-22s starting", name)
    t0 = time.time()
    summary = fn(ctx) or {}
    summary["seconds"] = round(time.time() - t0, 1)
    ctx.mark_done(name, summary)
    log.info("stage %-22s done in %.1fs", name, summary["seconds"])
    return summary


def supabase_client():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (training/.env) to publish models")
    return create_client(url, key)


def roc_auc(y: np.ndarray, s: np.ndarray) -> float | None:
    from sklearn.metrics import roc_auc_score

    y = np.asarray(y)
    if len(np.unique(y)) < 2:
        return None
    return float(roc_auc_score(y, s))


def eer(y: np.ndarray, s: np.ndarray) -> float | None:
    from sklearn.metrics import roc_curve

    y = np.asarray(y)
    if len(np.unique(y)) < 2:
        return None
    fpr, tpr, _ = roc_curve(y, s)
    fnr = 1 - tpr
    i = int(np.nanargmin(np.abs(fnr - fpr)))
    return float((fpr[i] + fnr[i]) / 2)
