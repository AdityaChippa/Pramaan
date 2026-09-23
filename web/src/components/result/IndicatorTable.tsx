"use client";
import { Fragment, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ExternalLink } from "lucide-react";
import { GROUP_LABELS } from "@/config/indicators";
import type { Indicator, ModalityContributions } from "@/types/case";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = { ok: "", not_applicable: "Not applicable", error: "Error", informational: "Informational" };

function scoreColor(s: number | null) {
  if (s === null) return undefined;
  return s >= 0.7 ? "#FF4D5E" : s <= 0.3 ? "#3DDC97" : "#F5A524";
}

export function IndicatorTable({ indicators, contributions, signed, onViewArtifact }: {
  indicators: Indicator[];
  contributions: ModalityContributions | null;
  signed: Record<string, string>;
  onViewArtifact: (path: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const contrib = new Map((contributions?.per_indicator ?? []).map((r) => [r.id, r]));
  const sorted = [...indicators].sort((a, b) => Number(b.status === "ok") - Number(a.status === "ok"));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="label-xs text-left">
          <tr className="border-b border-hairline">
            <th className="py-2">Indicator</th><th>Group</th><th className="text-right">Measured</th><th className="pl-4">Expected</th>
            <th className="text-right">Suspicion</th><th className="pl-4">Direction</th><th className="text-right">Evidence</th><th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((ind, i) => {
            const c = contrib.get(ind.id);
            const dir = c && c.mask === 1 ? (c.contribution > 1e-9 ? "→ fake" : c.contribution < -1e-9 ? "→ real" : "neutral") : ind.status === "ok" ? "not in fusion" : "—";
            return (
              <Fragment key={ind.id}>
                <motion.tr initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={cn("border-b border-hairline align-top", ind.status !== "ok" && "text-muted")}>
                  <td className="py-3 pr-3">
                    <p className={cn(ind.status === "ok" && "text-fog")}>{ind.name}</p>
                    {ind.status !== "ok" && <p className="text-xs">{STATUS_LABEL[ind.status]}{ind.reason ? ` — ${ind.reason}` : ""}</p>}
                  </td>
                  <td className="text-xs">{GROUP_LABELS[ind.group]}</td>
                  <td className="mono text-right">{ind.value === null ? "—" : `${num(ind.value, 4)} ${ind.unit}`}</td>
                  <td className="pl-4 text-xs">{ind.expected_range}</td>
                  <td className="mono text-right" style={{ color: scoreColor(ind.score_0_1) }}>
                    {ind.score_0_1 === null ? "—" : num(ind.score_0_1, 3)}
                    {ind.status === "ok" && ind.score_0_1 !== null && !ind.calibrated && <span className="block text-[10px] text-muted">default calibrator</span>}
                  </td>
                  <td className="mono pl-4 text-xs">{dir}</td>
                  <td className="text-right">
                    {ind.evidence_artifact_url ? (
                      <button className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline disabled:opacity-40"
                        disabled={!signed[ind.evidence_artifact_url]} onClick={() => onViewArtifact(ind.evidence_artifact_url!)}>
                        View artifact <ExternalLink size={12} />
                      </button>
                    ) : <span className="text-xs">—</span>}
                  </td>
                  <td className="pl-2 text-right">
                    <button aria-label="Details" onClick={() => setOpen(open === ind.id ? null : ind.id)}>
                      <ChevronDown size={16} className={cn("transition", open === ind.id && "rotate-180")} />
                    </button>
                  </td>
                </motion.tr>
                {open === ind.id && (
                  <tr className="border-b border-hairline bg-ink/40">
                    <td colSpan={8} className="grid gap-3 px-3 py-4 text-xs md:grid-cols-2">
                      <div>
                        <p className="label-xs mb-1">Method</p><p>{ind.method}</p>
                        <p className="label-xs mb-1 mt-3">Reference</p><p>{ind.reference}</p>
                      </div>
                      <div>
                        <p className="label-xs mb-1">Measured features</p>
                        <pre className="mono max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-hairline p-2">{JSON.stringify({ features: ind.features, details: ind.details }, null, 2)}</pre>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
