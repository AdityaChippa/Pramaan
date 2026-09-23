"""Model providers. RegistryModelProvider (engine) and LocalModelProvider (training / offline) expose
identical objects so every pipeline computes features the same way."""
from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

from app.models.onnx_models import AASIST, FaceCNN, UnivFD, load_probe, make_session
from app.models.registry import download_model

log = logging.getLogger("pramaan.models")

MODEL_NAMES = ("face_cnn", "univfd", "aasist", "fusion")


class ModelProvider:
    def __init__(self) -> None:
        self.face_cnn: FaceCNN | None = None
        self.univfd: UnivFD | None = None
        self.aasist: AASIST | None = None
        self.fusion: dict[str, Any] | None = None
        self.versions: dict[str, str] = {}
        self.errors: dict[str, str] = {}
        self.loading = False
        self._lock = threading.Lock()

    def _load_folder(self, name: str, folder: Path, version: str) -> None:
        if name == "face_cnn":
            self.face_cnn = FaceCNN(make_session(folder / "face_cnn.onnx"), version)
        elif name == "univfd":
            self.univfd = UnivFD(make_session(folder / "clip_vitl14_visual.onnx"), load_probe(folder / "probe.json"), version)
        elif name == "aasist":
            self.aasist = AASIST(make_session(folder / "aasist_l.onnx"), version)
        elif name == "fusion":
            self.fusion = json.loads((folder / "fusion.json").read_text())
        self.versions[name] = version

    def status(self) -> dict[str, Any]:
        return {
            "loading": self.loading,
            "versions": dict(self.versions),
            "errors": dict(self.errors),
            "fusion_calibrated": bool(self.fusion and self.fusion.get("calibrated")),
        }


class LocalModelProvider(ModelProvider):
    """Loads <root>/<name>/ folders (same file names as the registry)."""

    def __init__(self, root: str | Path, version: str = "local") -> None:
        super().__init__()
        root = Path(root)
        for name in MODEL_NAMES:
            folder = root / name
            if folder.exists():
                try:
                    self._load_folder(name, folder, version)
                except Exception as exc:  # noqa: BLE001
                    self.errors[name] = str(exc)


class RegistryModelProvider(ModelProvider):
    def __init__(self, client: Any, cache_dir: str | Path) -> None:
        super().__init__()
        self.client = client
        self.cache_dir = Path(cache_dir)

    def reload(self) -> None:
        with self._lock:
            self.loading = True
            try:
                rows = self.client.table("model_registry").select("*").eq("is_active", True).execute().data or []
                found = {r["name"]: r for r in rows}
                for name in MODEL_NAMES:
                    row = found.get(name)
                    if row is None:
                        self.errors[name] = "no active version in model_registry"
                        continue
                    try:
                        folder = download_model(self.client, row, self.cache_dir)
                        self._load_folder(name, folder, row["version"])
                        self.errors.pop(name, None)
                        log.info("loaded %s@%s", name, row["version"])
                    except Exception as exc:  # noqa: BLE001
                        self.errors[name] = f"{type(exc).__name__}: {exc}"
                        log.exception("failed to load %s", name)
            finally:
                self.loading = False


_provider: RegistryModelProvider | None = None


def get_provider() -> RegistryModelProvider:
    global _provider
    if _provider is None:
        from app.config import get_settings
        from app.supabase_io import client

        _provider = RegistryModelProvider(client(), get_settings().MODEL_CACHE_DIR)
    return _provider
