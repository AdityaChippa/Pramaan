# Datasets

No dataset is downloaded automatically: none of the sources below offers a direct, licence-free URL that could be
verified from the build environment. `py -m training.download_datasets --data datasets` prints this guidance and counts
what is already in place.

## Folder contract
```
datasets/
  image/real/<source-or-identity>/**.jpg|png|webp
  image/fake/<generator-or-method>/**
  video/real/<source>/**.mp4|avi|mov
  video/fake/<method>/**
  audio/real/<speaker-or-corpus>/**.wav|flac|mp3
  audio/fake/<system>/**
  audio/asvspoof2019_la/        (optional, official layout — read from its protocol files)
```
Splits are made per **group**: the first two sub-folder levels, or an id prefix in flat FaceForensics++/Celeb-DF style
names (`000_003.mp4`, `id0_id16_0000.mp4`). Keep one identity/source per folder to avoid train/test leakage.

## Sources and placement
| Modality | Dataset | Access | Place |
|---|---|---|---|
| video (+ frames for image) | **FaceForensics++** — github.com/ondyari/FaceForensics | Google form in the README, then the provided download script (choose `c23` compression to save space) | `original_sequences/youtube/c23/videos` → `video/real/ffpp/`; `manipulated_sequences/<Method>/c23/videos` → `video/fake/ffpp_<Method>/` |
| video | **Celeb-DF v2** — github.com/yuezunli/celeb-deepfakeforensics | request form | `Celeb-real/`, `YouTube-real/` → `video/real/celebdf/`; `Celeb-synthesis/` → `video/fake/celebdf/` |
| video | **DFDC** — ai.meta.com/datasets/dfdc | licence acceptance, very large multi-part download | per part, use `metadata.json`: `REAL` → `video/real/dfdc_<part>/`, `FAKE` → `video/fake/dfdc_<part>/` |
| audio | **ASVspoof 2019 LA** — asvspoof.org (hosted on Edinburgh DataShare) | licence acceptance | extract `LA.zip` unchanged into `audio/asvspoof2019_la/` |
| audio | **WaveFake** — github.com/RUB-SysSec/WaveFake | Zenodo link in README; real clips come from LJSpeech / JSUT | generated → `audio/fake/wavefake_<vocoder>/`; LJSpeech wavs → `audio/real/ljspeech/` |
| audio | **In-the-Wild** — deepfake-total.com/in_the_wild | direct archive on the project page | by `meta.csv`: bona-fide → `audio/real/itw/`, spoof → `audio/fake/itw/` |
| image | **Real vs. diffusion**, e.g. **GenImage** — github.com/GenImage-Dataset/GenImage | links in README | `<gen>/train/ai` → `image/fake/genimage_<gen>/`; `<gen>/train/nature` → `image/real/genimage_<gen>/` |

Sizes change between releases; check each page. As orders of magnitude: FaceForensics++ c23 videos and Celeb-DF v2 are
tens of GB, DFDC is hundreds of GB, ASVspoof 2019 LA and In-the-Wild are several GB, WaveFake tens of GB, GenImage
subsets vary widely. A `quick` run needs only a few hundred items per class per modality.

## Licences and ethics
All of these datasets are for research use under their own terms; several contain identifiable people. Do not publish
extracted faces or voices, and respect takedown and non-commercial clauses. Exclude any sample whose licence you have not accepted.
