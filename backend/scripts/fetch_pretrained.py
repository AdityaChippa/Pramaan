"""Download the verified public weights and build the engine's ONNX model folders (version 0-pretrained).

Run from the repository root with the backend venv + export tooling installed:
    pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
    pip install -r backend/requirements-export.txt
    py backend/scripts/fetch_pretrained.py --out backend/pretrained

Sources (all verified to resolve during the build; byte sizes are checked after download):
  face_cnn  DeepfakeBench EfficientNet-B4  github.com/SCLBD/DeepfakeBench releases v1.0.1 effnb4_best.pth
  aasist    AASIST-L weights + config      github.com/clovaai/aasist (MIT)
  univfd    UnivFD linear probe            github.com/Yuheng-Li/UniversalFakeDetect fc_weights.pth
            CLIP ViT-L/14 image tower      fetched by open_clip (`ViT-L-14`, pretrained `openai`)
  fusion    documented default weights (calibrated: false)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "backend"))

from training.common import download, load_config  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "backend" / "pretrained"))
    ap.add_argument("--only", default="face_cnn,univfd,aasist,fusion")
    args = ap.parse_args()
    out = Path(args.out).resolve()
    cache = out / "_downloads"
    only = {x.strip() for x in args.only.split(",")}
    pre = load_config()["pretrained"]

    from training.stages.export import build_aasist_onnx, build_clip_onnx, build_face_onnx
    from training.models.univfd import probe_from_pth

    if "face_cnn" in only:
        w = download(pre["face_cnn"]["url"], cache / "effnb4_best.pth", pre["face_cnn"]["size"])
        build_face_onnx(w, out / "face_cnn")
    if "univfd" in only:
        d = out / "univfd"
        d.mkdir(parents=True, exist_ok=True)
        probe = probe_from_pth(download(pre["univfd_probe"]["url"], cache / "fc_weights.pth", pre["univfd_probe"]["size"]))
        (d / "probe.json").write_text(json.dumps(probe))
        if not (d / "clip_vitl14_visual.onnx").exists():
            build_clip_onnx(pre["clip"]["open_clip_model"], pre["clip"]["open_clip_pretrained"], d)
    if "aasist" in only:
        w = download(pre["aasist_l"]["url"], cache / "AASIST-L.pth", pre["aasist_l"]["size"])
        c = download(pre["aasist_l"]["config_url"], cache / "AASIST-L.conf")
        build_aasist_onnx(w, c, out / "aasist")
    if "fusion" in only:
        from app.pipeline.fusion.defaults import default_fusion_config

        (out / "fusion").mkdir(parents=True, exist_ok=True)
        (out / "fusion" / "fusion.json").write_text(json.dumps(default_fusion_config(), indent=2))

    # Load every built folder with the engine's own loader so a broken export is caught here, not in production.
    from app.models.loader import LocalModelProvider

    provider = LocalModelProvider(out, version="0-pretrained")
    print("loaded:", sorted(provider.versions), "errors:", provider.errors or "none")
    return 1 if provider.errors else 0


if __name__ == "__main__":
    sys.exit(main())
