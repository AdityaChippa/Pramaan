#!/usr/bin/env bash
# Deploy the engine to a Hugging Face Docker Space with git (alternative to scripts/deploy_engine.py).
# Usage (Git Bash / macOS / Linux, from the repo root):
#   hf auth login --add-to-git-credential
#   hf repos create <user>/pramaan-engine --type space --sdk docker --exist-ok
#   bash scripts/deploy_engine.sh <user>/pramaan-engine
# Space secrets are NOT set by this script: use `py scripts/deploy_engine.py --space <user>/pramaan-engine`
# once, or the Space settings page (Settings → Variables and secrets).
set -euo pipefail

SPACE="${1:?usage: bash scripts/deploy_engine.sh <hf-user>/<space-name>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d 2>/dev/null || mktemp -d -t pramaan-space)"
trap 'rm -rf "$WORK"' EXIT

echo "cloning https://huggingface.co/spaces/${SPACE}"
git clone --depth 1 "https://huggingface.co/spaces/${SPACE}" "$WORK/space"

# Replace the Space contents with backend/ (excluding local-only files).
find "$WORK/space" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
( cd "$ROOT/backend" && tar --exclude=.venv --exclude=__pycache__ --exclude='*.pyc' --exclude=.env \
    --exclude=pretrained --exclude=models_local --exclude='*.onnx' --exclude='*.pth' --exclude=scripts -cf - . ) \
  | ( cd "$WORK/space" && tar -xf - )

cd "$WORK/space"
git add -A
if git diff --cached --quiet; then
  echo "no changes to deploy"
  exit 0
fi
git -c user.name="${GIT_AUTHOR_NAME:-pramaan-deploy}" -c user.email="${GIT_AUTHOR_EMAIL:-deploy@localhost}" commit -m "Deploy PRAMAAN engine $(date -u +%Y-%m-%dT%H:%MZ)"
git push origin HEAD
OWNER="${SPACE%%/*}"; NAME="${SPACE#*/}"
echo "pushed. Build logs: https://huggingface.co/spaces/${SPACE}?logs=build"
echo "health:  curl https://$(echo "${OWNER}-${NAME}" | tr '[:upper:]_' '[:lower:]-').hf.space/health"
