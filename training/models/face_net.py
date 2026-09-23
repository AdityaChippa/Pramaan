"""EfficientNet-B4 face classifier in DeepfakeBench's layout (verified against
SCLBD/DeepfakeBench training/networks/efficientnetb4.py: plain 3×3/2 Conv2d stem without padding,
_fc = Identity, last_layer Linear(1792, 2), probability of fake = softmax(logits)[:, 1])."""
from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F


class EfficientNetB4Backbone(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        from efficientnet_pytorch import EfficientNet

        self.efficientnet = EfficientNet.from_name("efficientnet-b4")
        self.efficientnet._conv_stem = nn.Conv2d(3, 48, kernel_size=3, stride=2, bias=False)
        self.efficientnet._fc = nn.Identity()
        self.last_layer = nn.Linear(1792, 2)

    def features(self, x: torch.Tensor) -> torch.Tensor:
        return self.efficientnet.extract_features(x)

    def classifier(self, f: torch.Tensor) -> torch.Tensor:
        return self.last_layer(F.adaptive_avg_pool2d(f, 1).flatten(1))


class FaceNet(nn.Module):
    """Wrapper whose state_dict keys match the DeepfakeBench checkpoint (`backbone.*`)."""

    def __init__(self) -> None:
        super().__init__()
        self.backbone = EfficientNetB4Backbone()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone.classifier(self.backbone.features(x))


class FaceNetWithCAM(nn.Module):
    """Export wrapper: logits (N,2) and class-activation map cam (N,8,8) = (w_fake − w_real) · features.
    Because the head is avg-pool + linear, mean(cam) + (b_fake − b_real) equals the fake-vs-real logit margin."""

    def __init__(self, net: FaceNet) -> None:
        super().__init__()
        self.net = net

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        f = self.net.backbone.features(x)
        logits = self.net.backbone.classifier(f)
        w = self.net.backbone.last_layer.weight
        diff = (w[1] - w[0]).view(1, -1, 1, 1)
        cam = (f * diff).sum(dim=1, keepdim=True)
        cam = F.adaptive_avg_pool2d(cam, (8, 8)).squeeze(1)
        return logits, cam


def load_face_net(weights: Path, device: str = "cpu") -> FaceNet:
    net = FaceNet()
    state = torch.load(weights, map_location="cpu")
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    wanted = {k: v for k, v in state.items() if k.startswith("backbone.efficientnet.") or k.startswith("backbone.last_layer.")}
    missing, unexpected = net.load_state_dict(wanted, strict=False)
    missing = [k for k in missing if not k.endswith("num_batches_tracked")]
    if missing:
        raise RuntimeError(f"face CNN checkpoint is missing {len(missing)} tensors, e.g. {missing[:5]}")
    return net.to(device).eval()


def set_trainable_blocks(net: FaceNet, n_last: int) -> int:
    """Freeze everything, then unfreeze the last `n_last` MBConv blocks, the head conv/bn and the classifier."""
    eff = net.backbone.efficientnet
    for p in net.parameters():
        p.requires_grad = False
    blocks = list(eff._blocks)
    for blk in blocks[max(0, len(blocks) - n_last):]:
        for p in blk.parameters():
            p.requires_grad = True
    for mod in (eff._conv_head, eff._bn1, net.backbone.last_layer):
        for p in mod.parameters():
            p.requires_grad = True
    return sum(p.numel() for p in net.parameters() if p.requires_grad)
