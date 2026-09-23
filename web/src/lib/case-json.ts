import type { CaseEvent, CaseRow } from "@/types/case";

function round(v: unknown): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? Number(v.toFixed(4)) : null;
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]));
  return v;
}

/** The only input the Groq routes see: stored case evidence, rounded to 4 decimals, no media or URLs. */
export function buildCaseJson(row: CaseRow, events: CaseEvent[]) {
  const indicators = (row.indicators ?? []).map((i) => ({
    id: i.id, name: i.name, group: i.group, status: i.status, reason: i.reason ?? null,
    value: i.value, unit: i.unit, expected_range: i.expected_range, suspicion_score: i.score_0_1,
    calibrated: i.calibrated, features: i.features, method: i.method, reference: i.reference,
  }));
  const contrib = row.modality_contributions;
  return round({
    case: { id: row.id, media_type: row.media_type, source: row.source, filename: row.filename, sha256: row.sha256, phash: row.phash,
      file_size_bytes: row.file_size, duration_s: row.duration_s, created_at: row.created_at, completed_at: row.completed_at },
    verdict: row.verdict,
    probability_manipulated: row.probability,
    thresholds: row.thresholds,
    calibrated: row.calibrated,
    modality_contributions: contrib ? {
      combo: contrib.combo, intercept: contrib.intercept, logit: contrib.logit, groups: contrib.groups,
      per_indicator: contrib.per_indicator.filter((r) => r.mask === 1).map((r) => ({ id: r.id, weight: r.weight, logit_score: r.x, contribution: r.contribution })),
    } : null,
    indicators,
    counts: {
      indicators_total: indicators.length,
      indicators_ok: indicators.filter((i) => i.status === "ok").length,
      indicators_not_applicable: indicators.filter((i) => i.status === "not_applicable").length,
      indicators_error: indicators.filter((i) => i.status === "error").length,
      indicators_used_in_fusion: contrib ? contrib.per_indicator.filter((r) => r.mask === 1).length : 0,
      custody_steps: events.length,
    },
    model_versions: row.model_versions,
    custody_log: events.map((e) => ({ step: e.step, status: e.status, started_at: e.started_at, finished_at: e.finished_at,
      duration_ms: (e.detail as { duration_ms?: number })?.duration_ms ?? null })),
  });
}
