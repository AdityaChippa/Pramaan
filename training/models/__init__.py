"""Model definitions used by training and by backend/scripts/fetch_pretrained.py."""
from __future__ import annotations

import json
from pathlib import Path


def load_aasist_l(weights: Path, conf: Path, device: str = "cpu"):
    """Builds AASIST-L from the official config and loads the published state_dict (strict)."""
    import torch

    from training.models.aasist import Model

    cfg = json.loads(conf.read_text(encoding="utf-8"))["model_config"]
    model = Model(cfg)
    state = torch.load(weights, map_location=device)
    model.load_state_dict(state, strict=True)
    return model.to(device).eval()
