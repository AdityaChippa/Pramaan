import type { IndicatorGroup, Verdict, MediaType } from "@/types/case";

export const GROUP_LABELS: Record<IndicatorGroup, string> = {
  visual: "Visual",
  temporal: "Temporal / biological",
  audio: "Audio",
  provenance: "Metadata / provenance",
};

export const GROUP_ORDER: IndicatorGroup[] = ["visual", "temporal", "audio", "provenance"];

export const VERDICT_META: Record<Verdict, { label: string; color: string }> = {
  authentic: { label: "Authentic", color: "#3DDC97" },
  inconclusive: { label: "Inconclusive", color: "#F5A524" },
  manipulated: { label: "Manipulated", color: "#FF4D5E" },
};

/** Pipeline steps written by backend/app/pipeline/run.py, in execution order. */
export const PIPELINE_STEPS: { step: string; label: string }[] = [
  { step: "ingest", label: "Ingest & download" },
  { step: "hash", label: "SHA-256 + perceptual hash" },
  { step: "metadata", label: "Metadata & provenance" },
  { step: "routing", label: "Modality routing" },
  { step: "image_detectors", label: "Image detectors" },
  { step: "video_frames", label: "Per-frame face CNN" },
  { step: "video_temporal", label: "Temporal & biological signals" },
  { step: "audio", label: "Audio anti-spoofing" },
  { step: "fusion", label: "Evidence fusion" },
  { step: "artifacts_upload", label: "Artifacts upload" },
  { step: "finalize", label: "Finalize & custody seal" },
];

export const ACCEPT_MIME: Record<MediaType, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  audio: ["audio/wav", "audio/x-wav", "audio/wave", "audio/flac", "audio/mpeg", "audio/webm", "audio/ogg", "audio/mp4"],
};

export const PRESETS: Record<string, { label: string; accept: MediaType[]; note: string }> = {
  "contact-center": { label: "Contact-Center Voice Fraud", accept: ["audio"], note: "Voice anti-spoofing, prosody and breath analysis weighted by the audio fusion model." },
  kyc: { label: "Video KYC & Conferencing", accept: ["video"], note: "Face CNN timeline, blink, jitter, rPPG and AV-sync on a recorded or uploaded selfie video." },
  newsroom: { label: "Newsroom & Brand Protection", accept: ["image", "video"], note: "Generic AI-image detection, frequency, ELA and provenance checks for published media." },
  evidence: { label: "Law-Enforcement Evidence", accept: ["image", "video", "audio"], note: "Full pipeline with chain-of-custody log and a court-style PDF report." },
};

export function mediaTypeFromMime(mime: string): MediaType | null {
  for (const [t, list] of Object.entries(ACCEPT_MIME) as [MediaType, string[]][]) {
    if (list.includes(mime)) return t;
  }
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}
