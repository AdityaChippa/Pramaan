# 5-minute demo script

Prep (before judges arrive): engine Space awake (`curl …/health`), signed in on the deployed site, one authentic clip you
recorded and one manipulated sample from a dataset's fake split on the desktop, a previous case already marked shareable,
PDF viewer ready, browser zoom 90 %.

| Time | Screen | Say / do |
|---|---|---|
| 0:00–0:40 | **Landing** | Scroll slowly: scan-face hero ("every analysis starts by hashing the evidence"), showcase marquee, How it works paragraph, detection modules, use-case cards. Point at the Model Card strip: real registry metrics or the explicit "uncalibrated" state — no invented accuracy. |
| 0:40–1:40 | **Live** | Start Live Monitor on a judge's face. Show 3-second windows arriving, sparklines for face CNN, blink, jitter, AASIST-L, and the 60-second timeline. Ask them to blink normally, then hold eyes open — blink indicator reacts. Stop → session case created. |
| 1:40–2:20 | **Analyze** | Drop the manipulated sample. Point out browser SHA-256 in pre-flight, then the live pipeline steps (ingest, hash, metadata, routing, detectors, fusion, artifacts) with durations. |
| 2:20–3:40 | **Result** | Verdict + gauge with band thresholds. Contribution chart: "these are exact log-odds, the bars sum to the logit". Indicator table: open rPPG or blink row to show measured values vs. expected ranges and the citation. Heatmap viewer: drag the original/overlay slider, jump to a top frame from the timeline. Generate the executive summary; ask the chat "Which indicator pushed hardest toward fake and by how much?" — note the grounding check. |
| 3:40–4:20 | **Archive** | Dome of cases: drag, hover lifts a card, click flies to it and opens the drawer. Toggle "Cluster by verdict". |
| 4:20–5:00 | **PDF + Verify** | Download PDF: custody table, QR code. Open `/verify`, drop the same file → case found; drop a re-saved copy → not found ("a single byte changes the hash"). Close on the API page: one curl call, quota headers. |

Fallbacks: if the Space is cold, narrate the "Engine waking up" counter and show a completed case first. If Wi-Fi is
blocked for webcam, use the Record tab's microphone mode or skip to the upload.
