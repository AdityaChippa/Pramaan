"""UnivFD (Ojha, Li & Lee, CVPR 2023): frozen CLIP ViT-L/14 image features + one linear layer.
The CLIP tower comes from open_clip (`ViT-L-14`, pretrained `openai`); the probe from
Yuheng-Li/UniversalFakeDetect pretrained_weights/fc_weights.pth (keys `weight` (1,768), `bias` (1,))."""
from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn


class ClipVisual(nn.Module):
    """Export wrapper: pixel_values (N,3,224,224, CLIP-normalised) → embedding (N,768), unnormalised
    `encode_image` output, which is what the UnivFD probe was trained on."""

    def __init__(self, clip_model) -> None:
        super().__init__()
        self.visual = clip_model.visual

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        return self.visual(pixel_values)


def load_clip(model_name: str = "ViT-L-14", pretrained: str = "openai", device: str = "cpu"):
    import open_clip

    model, _, _ = open_clip.create_model_and_transforms(model_name, pretrained=pretrained, device=device)
    return model.eval()


def probe_from_pth(path: Path) -> dict:
    state = torch.load(path, map_location="cpu")
    w = state["weight"].reshape(-1).float().numpy()
    b = float(state["bias"].reshape(-1)[0])
    if w.shape[0] != 768:
        raise RuntimeError(f"unexpected UnivFD probe dimension {w.shape}")
    return {"w": w.tolist(), "b": b, "source": "Yuheng-Li/UniversalFakeDetect fc_weights.pth"}


@torch.no_grad()
def embed_batches(visual: nn.Module, batches, device: str) -> "torch.Tensor":
    out = []
    for x in batches:
        out.append(visual(x.to(device)).float().cpu())
    return torch.cat(out) if out else torch.empty(0, 768)
