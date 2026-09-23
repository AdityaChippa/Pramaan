"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "@/components/ui/Panel";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { ProgressMachine } from "@/components/analyze/ProgressMachine";
import { useCaseRealtime } from "@/hooks/useCaseRealtime";
import type { CaseEvent, CaseRow } from "@/types/case";
import type { ChatMessageRow } from "@/types/database";
import { bytes, isoTime, num, seconds, shortHash } from "@/lib/format";
import { ChatPanel } from "./ChatPanel";
import { ContributionChart } from "./ContributionChart";
import { CustodyLog } from "./CustodyLog";
import { GroqPanels } from "./GroqPanels";
import { HeatmapViewer } from "./HeatmapViewer";
import { IndicatorTable } from "./IndicatorTable";
import { ResultActions } from "./ResultActions";
import { Timelines } from "./Timelines";
import { VerdictGauge } from "./VerdictGauge";

const EASE = [0.25, 0.1, 0.25, 1] as const;

function Stage({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.35, duration: 0.4, ease: EASE }}>
      {children}
    </motion.div>
  );
}

export function ResultClient({ initialCase, initialEvents, messages, siteUrl }: { initialCase: CaseRow; initialEvents: CaseEvent[]; messages: ChatMessageRow[]; siteUrl: string }) {
  const { row: live, events } = useCaseRealtime(initialCase.id, { case: initialCase, events: initialEvents });
  const [patch, setPatch] = useState<Partial<CaseRow>>({});
  const row = { ...(live ?? initialCase), ...patch };
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);

  const paths = useMemo(() => {
    const a = row.artifacts;
    if (!a) return [];
    const p = new Set<string>();
    if (a.thumbnail_path) p.add(a.thumbnail_path);
    if (a.original_preview_path) p.add(a.original_preview_path);
    a.overlays.forEach((o) => { p.add(o.path); if (o.original_path) p.add(o.original_path); });
    a.top_frames.forEach((f) => { if (f.overlay_path) p.add(f.overlay_path); if (f.original_path) p.add(f.original_path); });
    (row.indicators ?? []).forEach((i) => i.evidence_artifact_url && p.add(i.evidence_artifact_url));
    return Array.from(p);
  }, [row.artifacts, row.indicators]);

  useEffect(() => {
    if (!paths.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < paths.length; i += 100) {
        const r = await fetch("/api/artifacts/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: paths.slice(i, i + 100) }) });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { urls: Record<string, string> };
        setSigned((s) => ({ ...s, ...j.urls }));
      }
    })();
    return () => { cancelled = true; };
  }, [paths]);

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label-xs">Case · {row.media_type} · {row.source}</p>
        <h1 className="truncate text-3xl font-semibold md:text-4xl">{row.filename ?? row.id}</h1>
        <p className="mono mt-1 text-xs text-muted">
          {row.id} · {bytes(row.file_size)}{row.duration_s ? ` · ${seconds(row.duration_s)}` : ""} · SHA-256 {shortHash(row.sha256 ?? row.client_sha256)} · {isoTime(row.created_at)}
        </p>
        {row.parent_case_id && <a className="mono text-xs underline" href={`/cases/${row.parent_case_id}`}>re-analysis of {row.parent_case_id}</a>}
      </div>
      <ResultActions row={row} siteUrl={siteUrl} onChange={(p) => setPatch((x) => ({ ...x, ...p }))} />
    </header>
  );

  if (row.status !== "complete") {
    const phase = row.status === "failed" ? "failed" : row.status === "processing" ? "processing" : "queued";
    return (
      <div className="grid gap-6">
        {header}
        <Panel title="Pipeline progress"><ProgressMachine phase={phase} uploadPct={100} events={events} error={row.error} /></Panel>
        {row.status === "failed" && <Panel title="Chain of custody"><CustodyLog row={row} events={events} /></Panel>}
      </div>
    );
  }

  const indicators = row.indicators ?? [];
  const versions = Object.entries(row.model_versions ?? {}).filter(([, v]) => typeof v === "string");
  const frameClick = (t: number) => {
    const tf = row.artifacts?.top_frames ?? [];
    if (!tf.length) return;
    const nearest = tf.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    setFocus(nearest.overlay_path);
    document.getElementById("heatmaps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid gap-6">
      {header}
      <Stage i={0}>
        <Panel>
          <div className="grid items-center gap-8 md:grid-cols-[1fr_1.2fr]">
            <div className="grid gap-4">
              <VerdictBadge verdict={row.verdict} status={row.status} size="lg" className="w-fit" />
              <p className="text-sm text-muted">
                Three-band decision: Authentic if p ≤ <span className="mono">{num(row.thresholds?.t_low ?? null, 2)}</span>, Manipulated if p ≥ <span className="mono">{num(row.thresholds?.t_high ?? null, 2)}</span>, otherwise Inconclusive.
              </p>
              {!row.calibrated && <p className="w-fit rounded-full border border-inconclusive/40 px-3 py-1 text-xs text-inconclusive">Uncalibrated defaults — fusion weights not yet trained</p>}
              <p className="mono text-[11px] text-muted">models: {versions.map(([k, v]) => `${k}@${v}`).join(" · ") || "none loaded"}</p>
            </div>
            <Stage i={1}><VerdictGauge probability={row.probability} verdict={row.verdict} thresholds={row.thresholds} /></Stage>
          </div>
        </Panel>
      </Stage>
      {row.modality_contributions && (
        <Stage i={2}><Panel title="Modality contribution (exact log-odds)"><ContributionChart contributions={row.modality_contributions} indicators={indicators} /></Panel></Stage>
      )}
      <Stage i={3}>
        <Panel title="Forensic indicators">
          <IndicatorTable indicators={indicators} contributions={row.modality_contributions} signed={signed}
            onViewArtifact={(p) => { setFocus(p); document.getElementById("heatmaps")?.scrollIntoView({ behavior: "smooth" }); }} />
        </Panel>
      </Stage>
      {row.artifacts && (
        <Stage i={4}><div id="heatmaps"><Panel title="Heatmaps & evidence artifacts"><HeatmapViewer artifacts={row.artifacts} signed={signed} focusPath={focus} /></Panel></div></Stage>
      )}
      {row.artifacts && (
        <Stage i={5}><Panel title="Timelines"><Timelines artifacts={row.artifacts} indicators={indicators} thresholds={row.thresholds} onFrameClick={frameClick} /></Panel></Stage>
      )}
      <Stage i={6}><Panel title="Chain of reasoning & custody"><CustodyLog row={row} events={events} /></Panel></Stage>
      <Stage i={7}>
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <GroqPanels caseId={row.id} report={row.report} summary={row.summary} />
          <ChatPanel caseId={row.id} initialMessages={messages} />
        </div>
      </Stage>
    </div>
  );
}
