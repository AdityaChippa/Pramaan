"""One-command training pipeline.

    py -m training.run_all --data ./datasets --modalities image,video,audio --budget quick

Run from the repository root. Every stage writes into <work>/<stage>/ and is skipped when its
.done.json marker exists, so an interrupted run resumes where it stopped. Use --force to redo stages.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from training.common import REPO_ROOT, Context, load_config, load_env_file, run_stage, seed_everything, setup_logging
from training.stages.evaluate import evaluate
from training.stages.export import export
from training.stages.extract import extract
from training.stages.finetune_audio import finetune_audio
from training.stages.finetune_face import finetune_face
from training.stages.handcrafted_features import handcrafted_features
from training.stages.prepare import prepare
from training.stages.publish import publish
from training.stages.train_fusion import train_fusion
from training.stages.train_univfd_probe import train_univfd_probe

# export runs before handcrafted_features so fusion is fitted on the exact ONNX graphs the engine serves.
STAGES = [
    ("prepare", prepare),
    ("extract", extract),
    ("finetune_face", finetune_face),
    ("train_univfd_probe", train_univfd_probe),
    ("finetune_audio", finetune_audio),
    ("export", export),
    ("handcrafted_features", handcrafted_features),
    ("train_fusion", train_fusion),
    ("evaluate", evaluate),
    ("publish", publish),
]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="PRAMAAN training pipeline")
    ap.add_argument("--data", default="datasets", help="dataset root following the folder contract")
    ap.add_argument("--modalities", default="image,video,audio")
    ap.add_argument("--budget", choices=["quick", "full"], default="quick")
    ap.add_argument("--work", default=None, help="work directory (default from config.yaml)")
    ap.add_argument("--force", default="", help="comma-separated stages to re-run, or 'all'")
    ap.add_argument("--until", default=None, help="stop after this stage")
    ap.add_argument("--no-publish", action="store_true", help="skip the publish stage")
    args = ap.parse_args(argv)

    cfg = load_config()
    load_env_file()
    work = Path(args.work or cfg["work_dir"])
    work = work if work.is_absolute() else (Path.cwd() / work)
    data = Path(args.data).resolve()
    setup_logging(work)
    log = logging.getLogger("pramaan.training")
    modalities = [m.strip() for m in args.modalities.split(",") if m.strip()]
    bad = [m for m in modalities if m not in ("image", "video", "audio")]
    if bad:
        ap.error(f"unknown modalities: {bad}")
    if not data.exists():
        ap.error(f"dataset folder {data} does not exist — see docs/DATASETS.md")
    force = {s for s, _ in STAGES} if args.force == "all" else {s.strip() for s in args.force.split(",") if s.strip()}
    seed_everything(int(cfg["seed"]))
    ctx = Context(data=data, work=work, modalities=modalities, budget=args.budget, cfg=cfg, force=force)
    log.info("repo=%s data=%s work=%s modalities=%s budget=%s", REPO_ROOT, data, work, modalities, args.budget)
    for name, fn in STAGES:
        if name == "publish" and args.no_publish:
            log.info("publish skipped (--no-publish)")
            break
        try:
            run_stage(ctx, name, fn)
        except Exception:
            log.exception("stage %s failed — fix the cause and re-run the same command to resume", name)
            return 1
        if args.until == name:
            break
    return 0


if __name__ == "__main__":
    sys.exit(main())
