export type MediaType = "image" | "video" | "audio";
export type CaseSource = "upload" | "record" | "url" | "live" | "api";
export type CaseStatus = "queued" | "processing" | "complete" | "failed";
export type Verdict = "authentic" | "inconclusive" | "manipulated";
export type IndicatorGroup = "visual" | "temporal" | "audio" | "provenance";
export type IndicatorStatus = "ok" | "not_applicable" | "error" | "informational";

export interface Indicator {
  id: string;
  name: string;
  modality: "image" | "video" | "audio" | "metadata";
  group: IndicatorGroup;
  status: IndicatorStatus;
  reason?: string | null;
  value: number | null;
  unit: string;
  expected_range: string;
  score_0_1: number | null;
  features: Record<string, number>;
  evidence_artifact_url?: string | null;
  method: string;
  reference: string;
  calibrated: boolean;
  details?: Record<string, unknown>;
}

export interface OverlayArtifact {
  id: string;
  label: string;
  path: string;
  indicator_id: string;
  frame_index?: number | null;
  t?: number | null;
  original_path?: string | null;
}

export interface TopFrame {
  frame_index: number;
  t: number;
  p: number;
  original_path: string;
  overlay_path: string;
}

export interface CaseArtifacts {
  thumbnail_path?: string | null;
  original_preview_path?: string | null;
  overlays: OverlayArtifact[];
  top_frames: TopFrame[];
  series: {
    frame_scores?: { t: number; p: number; frame_index: number }[];
    audio_spoof?: { t: number; p: number }[];
    ear?: { t: number; ear: number }[];
    blinks?: { t_start: number; t_end: number }[];
    rppg?: { t: number[]; forehead: number[]; left_cheek: number[]; right_cheek: number[]; freqs: number[]; power: number[] };
    av_sync?: { lags_ms: number[]; corr: number[] };
    spectrum?: { freq: number[]; power: number[] };
  };
}

export interface ContributionRow {
  id: string;
  group: IndicatorGroup;
  x: number;
  mask: number;
  weight: number;
  mask_weight: number;
  contribution: number;
}

export interface ModalityContributions {
  combo: string;
  intercept: number;
  logit: number;
  temperature_a: number;
  temperature_b: number;
  groups: Record<IndicatorGroup, { sum: number; pct: number; direction: "fake" | "real" | "neutral" }>;
  per_indicator: ContributionRow[];
}

export interface Thresholds {
  t_low: number;
  t_high: number;
  target_fpr: number;
  calibrated: boolean;
}

export interface GroqDoc {
  generated_at: string;
  model: string;
  grounding_warning: boolean;
  content: Record<string, unknown>;
}

export interface CaseRow {
  id: string;
  user_id: string;
  media_type: MediaType;
  source: CaseSource;
  filename: string | null;
  mime_type: string | null;
  preset: string | null;
  file_path: string | null;
  client_sha256: string | null;
  sha256: string | null;
  phash: string | null;
  file_size: number | null;
  duration_s: number | null;
  status: CaseStatus;
  verdict: Verdict | null;
  probability: number | null;
  calibrated: boolean;
  thresholds: Thresholds | null;
  modality_contributions: ModalityContributions | null;
  indicators: Indicator[] | null;
  artifacts: CaseArtifacts | null;
  model_versions: Record<string, string> | null;
  report: GroqDoc | null;
  summary: GroqDoc | null;
  is_shareable: boolean;
  is_public_showcase: boolean;
  parent_case_id: string | null;
  api_key_id: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CaseEvent {
  id: number;
  case_id: string;
  step: string;
  status: "started" | "ok" | "error" | "skipped";
  started_at: string;
  finished_at: string | null;
  detail: Record<string, unknown>;
}
