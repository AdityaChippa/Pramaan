"""ONNX export + dynamic INT8 quantisation helpers. Tensor names match backend/app/models/onnx_models.py."""
from __future__ import annotations

import logging
from pathlib import Path

import torch

log = logging.getLogger("pramaan.export")
OPSET = 17


def export_face(net_with_cam: torch.nn.Module, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 3, 256, 256)
    torch.onnx.export(
        net_with_cam.cpu().eval(), dummy, str(out), opset_version=OPSET,
        input_names=["input"], output_names=["logits", "cam"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}, "cam": {0: "batch"}},
    )
    return out


def export_clip_visual(visual: torch.nn.Module, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 3, 224, 224)
    torch.onnx.export(
        visual.cpu().eval(), dummy, str(out), opset_version=OPSET,
        input_names=["pixel_values"], output_names=["embedding"],
        dynamic_axes={"pixel_values": {0: "batch"}, "embedding": {0: "batch"}},
    )
    return out


class AasistExport(torch.nn.Module):
    """AASIST's forward returns (hidden, logits); the engine only needs logits for a fixed 64600-sample window."""

    def __init__(self, model: torch.nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        return self.model(waveform, Freq_aug=False)[1]


def export_aasist(model: torch.nn.Module, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 64600)
    torch.onnx.export(AasistExport(model.cpu().eval()), dummy, str(out), opset_version=OPSET,
                      input_names=["waveform"], output_names=["logits"])
    return out


def quantize_dynamic_int8(src: Path, dst: Path) -> Path:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
    return dst


def check_onnx(path: Path) -> None:
    import onnx

    onnx.checker.check_model(str(path), full_check=False)
    log.info("onnx ok: %s (%.1f MB)", path.name, path.stat().st_size / 1e6)
