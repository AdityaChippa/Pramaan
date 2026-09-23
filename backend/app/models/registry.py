"""Model registry: publish versioned model folders to Supabase Storage (chunked) and download them."""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

MODELS_BUCKET = "models"
DEFAULT_CHUNK_MB = 45.0


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def publish_model(
    client: Any,
    *,
    name: str,
    version: str,
    modality: str,
    files: list[Path],
    fmt: str,
    metrics: dict[str, Any] | None = None,
    dataset_stats: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
    thresholds: dict[str, Any] | None = None,
    calibrated: bool = False,
    chunk_mb: float = DEFAULT_CHUNK_MB,
    activate: bool = True,
    log=print,
) -> dict[str, Any]:
    """Uploads files to models/<name>/<version>/, splitting any file above `chunk_mb` into parts,
    writes manifest.json, inserts a model_registry row and flips is_active to the new version."""
    storage = client.storage.from_(MODELS_BUCKET)
    base = f"{name}/{version}"
    chunk = int(chunk_mb * 1024 * 1024)
    manifest: dict[str, Any] = {"name": name, "version": version, "format": fmt, "files": []}
    total = 0
    for f in files:
        size = f.stat().st_size
        total += size
        entry: dict[str, Any] = {"name": f.name, "size": size, "sha256": sha256_file(f), "parts": None}
        if size > chunk:
            parts = []
            with f.open("rb") as fh:
                idx = 0
                while True:
                    data = fh.read(chunk)
                    if not data:
                        break
                    part = f"{f.name}.part{idx:03d}"
                    storage.upload(f"{base}/{part}", data, {"content-type": "application/octet-stream", "upsert": "true"})
                    log(f"  uploaded {base}/{part} ({len(data) / 1e6:.1f} MB)")
                    parts.append(part)
                    idx += 1
            entry["parts"] = parts
        else:
            storage.upload(f"{base}/{f.name}", f.read_bytes(), {"content-type": "application/octet-stream", "upsert": "true"})
            log(f"  uploaded {base}/{f.name} ({size / 1e6:.1f} MB)")
        manifest["files"].append(entry)
    storage.upload(f"{base}/manifest.json", json.dumps(manifest, indent=2).encode(), {"content-type": "application/json", "upsert": "true"})

    row = {
        "name": name, "version": version, "modality": modality, "storage_path": f"{base}/", "format": fmt,
        "size_bytes": total, "metrics": metrics or {}, "dataset_stats": dataset_stats or {}, "config": config or {},
        "thresholds": thresholds, "calibrated": calibrated, "is_active": False,
    }
    client.table("model_registry").upsert(row, on_conflict="name,version").execute()
    if activate:
        client.table("model_registry").update({"is_active": False}).eq("name", name).neq("version", version).execute()
        client.table("model_registry").update({"is_active": True}).eq("name", name).eq("version", version).execute()
    log(f"registered {name}@{version} (active={activate})")
    return row


def download_model(client: Any, row: dict[str, Any], cache_dir: Path) -> Path:
    """Downloads (or reuses cached) files of a registry row; verifies SHA-256; returns the local folder."""
    storage = client.storage.from_(MODELS_BUCKET)
    base = row["storage_path"].rstrip("/")
    target = cache_dir / row["name"] / row["version"]
    target.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(storage.download(f"{base}/manifest.json"))
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2))
    for entry in manifest["files"]:
        dest = target / entry["name"]
        if dest.exists() and dest.stat().st_size == entry["size"] and sha256_file(dest) == entry["sha256"]:
            continue
        tmp = dest.with_suffix(dest.suffix + ".download")
        with tmp.open("wb") as out:
            for part in entry["parts"] or [entry["name"]]:
                out.write(storage.download(f"{base}/{part}"))
        if sha256_file(tmp) != entry["sha256"]:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"checksum mismatch for {row['name']}@{row['version']}/{entry['name']}")
        shutil.move(str(tmp), dest)
    return target
