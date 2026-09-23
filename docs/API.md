# Public API v1

Base URL: your deployment (`NEXT_PUBLIC_SITE_URL`). The interactive page with copyable snippets is `/docs/api`.

## Authentication
`Authorization: Bearer pk_<43 chars>`. Create, rotate and revoke keys on **API Keys**. The plaintext key is shown once;
the server stores `sha256(key)` and a 12-character prefix.

## Quota
Per key per UTC month (default `API_FREE_MONTHLY_QUOTA` = 50 scans). Only `POST /api/v1/analyze` consumes quota, atomically
via the `increment_api_usage` RPC. Every response carries
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds, first second of next UTC month).
Exhausted → `429` + `Retry-After`.

## `POST /api/v1/analyze`
- JSON `{ "media_url": "https://…" }` — fetched server-side (SSRF-guarded, content-type and `MAX_UPLOAD_MB` enforced), or
- `multipart/form-data` with `file` ≤ 4 MB (Vercel request limit).
Supported types: `image/jpeg|png|webp`, `video/mp4|webm|quicktime|x-msvideo`, `audio/wav|x-wav|wave|flac|mpeg|webm|ogg|mp4`.
Response `202 { "case_id": uuid, "status": "queued", "dispatched": bool }`.

## `GET /api/v1/cases/{id}`
Cases created by the key owner (dashboard or API). Fields: `id, media_type, source, filename, mime_type, sha256, phash,
file_size, duration_s, status (queued|processing|complete|failed), error, verdict, probability, calibrated, thresholds,
modality_contributions, indicators[], artifacts, model_versions, created_at, completed_at, custody_log[], links`.

`indicators[]`: `id, name, modality, group, status (ok|not_applicable|error|informational), reason, value, unit,
expected_range, score_0_1, calibrated, features{}, details{}, method, reference, evidence_artifact_url` (a private Storage
path; images are viewable in the dashboard).

`modality_contributions`: `combo, intercept, logit, temperature_a, temperature_b, groups{visual|temporal|audio|provenance:
{sum, pct, direction}}, per_indicator[{id, group, x, mask, weight, mask_weight, contribution}]` —
`intercept + Σ contribution = logit`, `probability = σ(logit)`.

## `GET /api/v1/cases/{id}/report.pdf`
`application/pdf`, header `x-report-sha256`. `409` until the case is complete.

## Errors
`400` malformed · `401` key missing/invalid/revoked · `404` not found for this owner · `409` not complete ·
`413` multipart > 4 MB · `415` unsupported type · `422` media_url not fetchable · `429` quota · `500` server.
All error bodies are `{ "error": string }`.

## Engine API (internal)
Called only by Vercel routes with `x-engine-secret`: `GET /health`, `POST /analyze {case_id}` → 202,
`POST /live/analyze {session_id, chunk_index, chunk_path, t_start}`, `POST /live/finalize {session_id}`, `POST /models/reload`.
