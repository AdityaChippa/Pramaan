"""Publish the folders built by fetch_pretrained.py to Supabase as version `0-pretrained`.

    py backend/scripts/publish_pretrained.py --dir backend/pretrained

Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment, backend/.env or training/.env.
A pretrained version is activated only when that model has no active version yet (so it never
replaces a trained one) unless --activate is passed.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

VERSION = "0-pretrained"
SPEC = {
    "face_cnn": ("image", ["face_cnn.onnx"], "onnx", "DeepfakeBench EfficientNet-B4 (effnb4_best.pth, release v1.0.1); CAM computed in-graph"),
    "univfd": ("image", ["clip_vitl14_visual.onnx", "probe.json"], "onnx+json", "OpenAI CLIP ViT-L/14 image tower via open_clip + UnivFD fc_weights.pth"),
    "aasist": ("audio", ["aasist_l.onnx"], "onnx", "clovaai/aasist AASIST-L.pth (ASVspoof 2019 LA)"),
    "fusion": ("multimodal", ["fusion.json"], "json", "Documented default weights — uncalibrated"),
}


def _load_env() -> None:
    for f in (REPO / "backend" / ".env", REPO / "training" / ".env"):
        if f.exists():
            for line in f.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"'))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(REPO / "backend" / "pretrained"))
    ap.add_argument("--activate", action="store_true", help="activate 0-pretrained even if another version is active")
    ap.add_argument("--chunk-mb", type=float, default=45.0)
    args = ap.parse_args()
    _load_env()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (backend/.env or training/.env)")
        return 2
    from supabase import create_client

    from app.models.registry import publish_model

    client = create_client(url, key)
    root = Path(args.dir).resolve()
    for name, (modality, files, fmt, note) in SPEC.items():
        paths = [root / name / f for f in files]
        missing = [p for p in paths if not p.exists()]
        if missing:
            print(f"skip {name}: missing {[str(m) for m in missing]} — run fetch_pretrained.py first")
            continue
        active = client.table("model_registry").select("version").eq("name", name).eq("is_active", True).execute().data or []
        activate = args.activate or not active
        if not activate:
            print(f"{name}: active version {active[0]['version']} kept (use --activate to switch to {VERSION})")
        publish_model(client, name=name, version=VERSION, modality=modality, files=paths, fmt=fmt,
                      metrics={"notes": f"{note}. Published pretrained weights; not evaluated on a local test split."},
                      config={"source": note}, thresholds={"t_low": 0.3, "t_high": 0.7, "target_fpr": 0.05} if name == "fusion" else None,
                      calibrated=False, chunk_mb=args.chunk_mb, activate=activate)
    print("done — the engine loads active versions at startup and re-checks the registry every 10 minutes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
