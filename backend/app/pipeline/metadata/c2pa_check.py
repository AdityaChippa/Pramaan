"""C2PA Content Credentials: validate with c2pa-python; fall back to JUMBF byte signatures."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.pipeline.types import IndicatorResult

AI_SOURCE_TYPES = ("trainedalgorithmicmedia", "compositewithtrainedalgorithmicmedia", "algorithmicmedia")
BENIGN_STATUS_CODES = {"signingCredential.untrusted"}


def _read_manifest_store(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        import c2pa  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return None, f"c2pa-python unavailable: {exc}"
    try:
        reader_cls = getattr(c2pa, "Reader", None)
        if reader_cls is not None:
            if hasattr(reader_cls, "from_file"):
                reader = reader_cls.from_file(str(path))
            else:
                mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
                        ".mp4": "video/mp4", ".mov": "video/quicktime", ".wav": "audio/wav", ".mp3": "audio/mpeg",
                        ".m4a": "audio/mp4"}.get(path.suffix.lower(), "application/octet-stream")
                with path.open("rb") as fh:
                    reader = reader_cls(mime, fh)
                    return json.loads(reader.json()), None
            return json.loads(reader.json()), None
        read_file = getattr(c2pa, "read_file", None)
        if read_file is not None:
            return json.loads(read_file(str(path), None)), None
        return None, "c2pa-python has no supported reader API"
    except Exception as exc:  # noqa: BLE001 — "no manifest" is raised as an exception by the library
        msg = str(exc)
        if "ManifestNotFound" in type(exc).__name__ or "no JUMBF" in msg or "not found" in msg.lower():
            return {}, None
        return None, f"{type(exc).__name__}: {msg[:200]}"


def _jumbf_present(path: Path) -> bool:
    data = path.read_bytes()
    return b"jumb" in data and b"c2pa" in data


def analyze_c2pa(path: str | Path) -> IndicatorResult:
    path = Path(path)
    store, err = _read_manifest_store(path)
    details: dict[str, Any] = {"library_error": err}
    if store is None:
        present = _jumbf_present(path)
        details.update({"manifest_present": present, "validated": False,
                        "note": "present, not validated" if present else "no C2PA manifest bytes found"})
        return IndicatorResult(id="c2pa", value=float(present), unit="flags",
                               features={"ai_assertion": 0.0, "valid": 0.0, "present": float(present)}, details=details)
    if not store:
        details.update({"manifest_present": False, "validated": True, "note": "no Content Credentials manifest"})
        return IndicatorResult(id="c2pa", value=0.0, unit="flags",
                               features={"ai_assertion": 0.0, "valid": 0.0, "present": 0.0}, details=details)

    active_label = store.get("active_manifest")
    manifests = store.get("manifests", {}) or {}
    active = manifests.get(active_label, {}) if active_label else {}
    statuses = store.get("validation_status") or []
    failures = [s for s in statuses if s.get("code") not in BENIGN_STATUS_CODES]
    blob = json.dumps(manifests).lower()
    ai = any(t in blob for t in AI_SOURCE_TYPES)
    sig = active.get("signature_info", {}) or {}
    details.update({
        "manifest_present": True,
        "validated": True,
        "active_manifest": active_label,
        "claim_generator": active.get("claim_generator"),
        "signer": sig.get("issuer") or sig.get("common_name"),
        "signed_at": sig.get("time"),
        "validation_failures": [s.get("code") for s in failures][:10],
        "ai_generation_assertion": ai,
        "ingredient_count": len(active.get("ingredients", []) or []),
    })
    valid = float(bool(active) and not failures)
    return IndicatorResult(id="c2pa", value=1.0 + float(ai), unit="flags",
                           features={"ai_assertion": float(ai), "valid": valid, "present": 1.0}, details=details)
