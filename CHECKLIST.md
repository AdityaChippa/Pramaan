# PRAMAAN build checklist

Status legend: `[x]` done · `[ ]` remaining. Build follows MASTER_PROMPT §16 order.

- [x] FILE_MANIFEST.md written; every listed file exists
- [x] Supabase migration: all tables, RLS, RPCs, buckets, realtime
- [x] Web: design tokens, fonts, all spec components (FadeIn, Magnet, AnimatedText, ContactButton, LiveProjectButton, Marquee, StackingCards)
- [x] Landing: all 8 sections, R3F scan face, reduced-motion fallbacks
- [x] Auth flow + app shell
- [x] Analyze: dropzone, record, URL ingest, client hashing, signed upload, state machine
- [x] Engine: image, video, audio, metadata pipelines — every indicator in §5
- [x] Engine: CAM-in-ONNX heatmaps and all artifacts uploaded
- [x] Fusion with exact contributions, calibration, three-band verdict, uncalibrated fallback
- [x] Realtime progress + reasoning/custody log
- [x] Result page: every element in §6.2
- [x] Groq: report, summary, chat — separate routes, grounding validator
- [x] PDF report + public verify page
- [x] Live Monitor end-to-end code path
- [x] Cases list + Dome Archive (billboarded cards, filters, cluster mode, 2D fallback)
- [x] Public API v1 + key management + quota + docs page
- [x] Model Card reading model_registry
- [x] Training pipeline: all 10 stages, resumable, publishes to Supabase, chunked upload
- [x] Pretrained fetch/publish scripts with verified URLs (or printed instructions)
- [x] No mock data / random values / TODO stubs anywhere (grep for `TODO`, `mock`, `Math.random`, `lorem` and resolve)
- [x] .env.example files complete; no secrets committed
- [x] README, RUN_GUIDE, DECISIONS, ARCHITECTURE, DATASETS, ALGORITHMS, API, DEMO_SCRIPT
- [x] Static checks passed (compileall; tsc --noEmit or noted as skipped)
- [x] Zip created, excludes heavy/secret files, presented

## Build-order progress (§16)
- [x] 1. CHECKLIST + FILE_MANIFEST + DECISIONS
- [x] 2. Supabase migration
- [x] 3. Web scaffold, tokens, spec components
- [x] 4. Engine skeleton
- [x] 5. Metadata + image pipeline → fusion → artifacts
- [x] 6. Analyze + Realtime + result page
- [x] 7. Video + audio pipelines
- [x] 8. Groq + chat + PDF + verify
- [x] 9. Landing with 3D
- [x] 10. Archive, cases list, Live Monitor
- [x] 11. Public API, keys, quota, docs, Model Card
- [x] 12. Training pipeline + pretrained fetch/publish
- [x] 13. Docs, RUN_GUIDE, DEMO_SCRIPT
- [x] 14. Stub grep, manifest diff, static checks, zip

## Remaining (exact, updated at each stop)
Nothing. Static checks: `python -m compileall backend training` passed; `npx tsc --noEmit` in web/ passed (137 source files, strict).
