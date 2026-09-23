export interface ProfileRow {
  id: string;
  display_name: string | null;
  org: string | null;
  role: string;
  created_at: string;
}

export interface ChatMessageRow {
  id: number;
  case_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  grounding_warning: boolean;
  created_at: string;
}

export interface LiveSessionRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  case_id: string | null;
  summary: Record<string, unknown> | null;
}

export interface LiveWindowIndicator {
  status: "ok" | "not_applicable" | "error" | "informational";
  score: number | null;
  value: number | null;
  unit: string;
  features: Record<string, number>;
  reason: string | null;
}

/** Written by the engine (backend/app/pipeline/live.py analyze_chunk). */
export interface LiveWindowScores {
  sha256: string;
  probability: number | null;
  verdict: "authentic" | "inconclusive" | "manipulated" | null;
  calibrated: boolean;
  thresholds: { t_low: number; t_high: number; target_fpr: number; calibrated: boolean };
  indicators: Record<string, LiveWindowIndicator>;
  model_versions: Record<string, string>;
}

export interface LiveWindowRow {
  id: number;
  session_id: string;
  chunk_index: number;
  chunk_path: string | null;
  t_start: number;
  scores: LiveWindowScores;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  prefix: string;
  name: string;
  monthly_quota: number | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ModelRegistryRow {
  id: string;
  name: string;
  version: string;
  modality: string;
  storage_path: string;
  format: string;
  size_bytes: number;
  metrics: Record<string, unknown>;
  dataset_stats: Record<string, unknown>;
  config: Record<string, unknown>;
  thresholds: { t_low: number; t_high: number; target_fpr: number } | null;
  calibrated: boolean;
  is_active: boolean;
  created_at: string;
}

export interface IndicatorCatalogRow {
  id: string;
  name: string;
  modality: string;
  group: string;
  method: string;
  reference: string;
  expected_range: string;
}

export interface CaseStats {
  total: number;
  complete: number;
  failed: number;
  in_progress: number;
  authentic: number;
  inconclusive: number;
  manipulated: number;
  images: number;
  videos: number;
  audios: number;
  mean_probability: number | null;
}
