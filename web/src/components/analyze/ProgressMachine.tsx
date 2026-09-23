"use client";
import { motion } from "framer-motion";
import { Check, Loader2, Minus, X } from "lucide-react";
import { PIPELINE_STEPS } from "@/config/indicators";
import { durationMs } from "@/lib/format";
import type { CaseEvent } from "@/types/case";
import type { Phase } from "@/store/analyze-store";
import { cn } from "@/lib/utils";

const PHASES: { id: Phase; label: string }[] = [
  { id: "hashing", label: "Hashing" },
  { id: "uploading", label: "Uploading" },
  { id: "queued", label: "Queued" },
  { id: "processing", label: "Processing" },
  { id: "complete", label: "Complete" },
];

export function ProgressMachine({ phase, uploadPct, events, error }: { phase: Phase; uploadPct: number; events: CaseEvent[]; error: string | null }) {
  const current = PHASES.findIndex((p) => p.id === phase);
  const latest = new Map<string, CaseEvent>();
  for (const e of events) latest.set(e.step, e);
  return (
    <div className="grid gap-8">
      <ol className="flex flex-wrap items-center gap-2">
        {PHASES.map((p, i) => {
          const done = phase === "failed" ? false : i < current || phase === "complete";
          const active = i === current && phase !== "complete";
          return (
            <li key={p.id} className="flex items-center gap-2">
              <span className={cn("rounded-full border px-3 py-1 text-xs transition", done ? "border-authentic/40 text-authentic" : active ? "border-fog/60 text-fog" : "border-hairline text-muted")}>
                {p.label}
                {p.id === "uploading" && active && <span className="mono ml-2">{uploadPct}%</span>}
              </span>
              {i < PHASES.length - 1 && <span className="h-px w-6 bg-hairline" />}
            </li>
          );
        })}
      </ol>
      {phase === "uploading" && (
        <div className="h-1 overflow-hidden rounded-full bg-hairline">
          <motion.div className="h-full bg-fog" animate={{ width: `${uploadPct}%` }} transition={{ ease: [0.25, 0.1, 0.25, 1] }} />
        </div>
      )}
      <ul className="grid gap-1">
        {PIPELINE_STEPS.map((s, i) => {
          const e = latest.get(s.step);
          const status = e?.status;
          return (
            <motion.li key={s.step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={cn("flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm", status === "started" ? "border-fog/40 bg-fog/5" : "border-hairline")}>
              <span className="flex items-center gap-3">
                {status === "ok" ? <Check size={14} className="text-authentic" /> : status === "started" ? <Loader2 size={14} className="animate-spin" /> :
                  status === "error" ? <X size={14} className="text-manipulated" /> : status === "skipped" ? <Minus size={14} className="text-muted" /> :
                  <span className="h-3.5 w-3.5 rounded-full border border-hairline" />}
                <span className={cn(!e && "text-muted")}>{s.label}</span>
              </span>
              <span className="mono text-xs text-muted">
                {status === "skipped" ? String((e?.detail as { reason?: string })?.reason ?? "skipped") : e?.finished_at ? durationMs(e.started_at, e.finished_at) : ""}
              </span>
            </motion.li>
          );
        })}
      </ul>
      {error && <p className="rounded-xl border border-manipulated/40 bg-manipulated/10 px-4 py-3 text-sm text-manipulated">{error}</p>}
    </div>
  );
}
