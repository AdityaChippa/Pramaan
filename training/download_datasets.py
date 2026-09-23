"""Dataset acquisition helper.

No dataset download URL could be verified from this build environment (the research/benchmark datasets
below are gated behind request forms or licence click-throughs, and search tooling returned no usable
direct links), so this script never downloads anything. It prints exact acquisition and placement
instructions and checks what is already present in the folder contract.

Usage:  py -m training.download_datasets --data ./datasets
"""
from __future__ import annotations

import argparse
from pathlib import Path

from training.common import MEDIA_EXT

SOURCES = [
    ("image+video", "FaceForensics++", "https://github.com/ondyari/FaceForensics",
     "Fill the Google form linked in the README, then run their download script. Put original_sequences/*/videos/*.mp4 under "
     "datasets/video/real/ffpp/ and manipulated_sequences/<method>/*/videos/*.mp4 under datasets/video/fake/ffpp_<method>/."),
    ("video", "Celeb-DF (v2)", "https://github.com/yuezunli/celeb-deepfakeforensics",
     "Request access via the form in the README. Celeb-real/ and YouTube-real/ → datasets/video/real/celebdf/; "
     "Celeb-synthesis/ → datasets/video/fake/celebdf/."),
    ("video", "DFDC", "https://ai.meta.com/datasets/dfdc/",
     "Accept the licence and download parts. Use metadata.json labels: REAL → datasets/video/real/dfdc_<part>/, FAKE → datasets/video/fake/dfdc_<part>/."),
    ("audio", "ASVspoof 2019 LA", "https://www.asvspoof.org/",
     "Download LA.zip from the Edinburgh DataShare record linked on asvspoof.org and extract it unchanged into datasets/audio/asvspoof2019_la/ "
     "(folders ASVspoof2019_LA_train, _dev, _eval and ASVspoof2019_LA_cm_protocols). The prepare stage reads the protocols automatically."),
    ("audio", "WaveFake", "https://github.com/RUB-SysSec/WaveFake",
     "Follow the README's Zenodo link. Generated clips → datasets/audio/fake/wavefake_<vocoder>/; the matching LJSpeech/JSUT real clips → datasets/audio/real/ljspeech/."),
    ("audio", "In-the-Wild", "https://deepfake-total.com/in_the_wild",
     "Download release_in_the_wild.zip; meta.csv labels: bona-fide → datasets/audio/real/itw/, spoof → datasets/audio/fake/itw/."),
    ("image", "Real vs diffusion images (e.g. GenImage)", "https://github.com/GenImage-Dataset/GenImage",
     "Pick one or more generator subsets. ai/ images → datasets/image/fake/genimage_<generator>/; nature/ → datasets/image/real/genimage_<generator>/."),
]


def count(folder: Path, exts: set[str]) -> int:
    return sum(1 for p in folder.rglob("*") if p.suffix.lower() in exts) if folder.exists() else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="datasets")
    args = ap.parse_args()
    root = Path(args.data)
    print("Folder contract:\n  datasets/image/{real,fake}/**  datasets/video/{real,fake}/**  datasets/audio/{real,fake}/**"
          "\n  (optional) datasets/audio/asvspoof2019_la/ in the official layout\n")
    for modality, name, url, how in SOURCES:
        print(f"[{modality}] {name}\n  {url}\n  {how}\n")
    print("Currently present:")
    for m, exts in MEDIA_EXT.items():
        for lab in ("real", "fake"):
            print(f"  {m:5s} {lab:4s}: {count(root / m / lab, exts)} files")
    asv = root / "audio" / "asvspoof2019_la"
    print(f"  asvspoof2019_la: {'found' if (asv / 'ASVspoof2019_LA_cm_protocols').exists() else 'not found'}")
    print("\nMinimum useful quick run: ~200 real + ~200 fake per modality you train. Grouping folders by identity/source avoids leakage.")


if __name__ == "__main__":
    main()
