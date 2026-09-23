"""Deploy backend/ to a Hugging Face Docker Space and set its secrets (huggingface_hub Python API).

Verified against huggingface_hub 1.32.0: HfApi.create_repo(space_sdk=...), upload_folder(repo_type="space",
ignore_patterns=...), add_space_secret(repo_id, key, value), add_space_variable(...), get_space_runtime(...).

    pip install -U huggingface_hub
    hf auth login                     # paste a token with WRITE scope
    py scripts/deploy_engine.py --space <hf-username>/pramaan-engine

Secrets are read from backend/.env (or the environment). ALLOWED_ORIGINS should list your Vercel URL.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
SECRETS = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ENGINE_SHARED_SECRET", "ALLOWED_ORIGINS")
VARIABLES = ("MODEL_CACHE_DIR", "MAX_VIDEO_SECONDS", "VIDEO_SAMPLE_FRAMES", "MAX_UPLOAD_MB", "TEMPORAL_FPS", "UNIVFD_OCCLUSION_GRID", "MAX_CONCURRENT_JOBS")
IGNORE = [".venv/**", "**/__pycache__/**", "*.pyc", ".env", "pretrained/**", "models_local/**", "*.onnx", "*.pth", "scripts/**"]


def read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k in SECRETS + VARIABLES})
    return env


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", required=True, help="<username>/<space-name>")
    ap.add_argument("--private", action="store_true", help="private Space (the web app then cannot reach it without a token — keep public)")
    ap.add_argument("--hardware", default=None, help="optional, e.g. cpu-upgrade (paid)")
    ap.add_argument("--skip-secrets", action="store_true")
    args = ap.parse_args()

    from huggingface_hub import HfApi

    api = HfApi()
    who = api.whoami()
    print(f"logged in as {who.get('name')}")
    env = read_env(BACKEND / ".env")
    missing = [k for k in SECRETS if not env.get(k)]
    if missing and not args.skip_secrets:
        print(f"missing values for {missing} in backend/.env — fill them or pass --skip-secrets")
        return 2

    url = api.create_repo(args.space, repo_type="space", space_sdk="docker", private=args.private, exist_ok=True,
                          space_hardware=args.hardware)
    print(f"space: {url}")
    if not args.skip_secrets:
        for k in SECRETS:
            api.add_space_secret(args.space, k, env[k])
        for k in VARIABLES:
            if env.get(k):
                api.add_space_variable(args.space, k, env[k])
        print(f"set secrets {list(SECRETS)} and variables {[k for k in VARIABLES if env.get(k)]}")
    api.upload_folder(repo_id=args.space, repo_type="space", folder_path=str(BACKEND), ignore_patterns=IGNORE,
                      commit_message="Deploy PRAMAAN engine")
    print("uploaded backend/ — the Space is now building (first build takes several minutes)")

    for _ in range(90):
        stage = api.get_space_runtime(args.space).stage
        print(f"  runtime stage: {stage}")
        if stage in ("RUNNING", "RUNTIME_ERROR", "BUILD_ERROR", "CONFIG_ERROR"):
            break
        time.sleep(20)
    owner, name = args.space.split("/", 1)
    print(f"health check: curl https://{owner}-{name}.hf.space/health".replace("_", "-").lower())
    return 0


if __name__ == "__main__":
    sys.exit(main())
