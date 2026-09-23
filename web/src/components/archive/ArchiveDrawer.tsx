"use client";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import type { CaseRow } from "@/types/case";
import { bytes, isoTime, num, pct, seconds } from "@/lib/format";
import { EASE } from "@/config/site";

export function ArchiveDrawer({ row, signed, onClose }: { row: CaseRow | null; signed: Record<string, string>; onClose: () => void }) {
  const thumb = row?.artifacts?.thumbnail_path ? signed[row.artifacts.thumbnail_path] : undefined;
  const top = (row?.indicators ?? []).filter((i) => i.status === "ok" && i.score_0_1 !== null).sort((a, b) => (b.score_0_1 ?? 0) - (a.score_0_1 ?? 0)).slice(0, 5);
  return (
    <AnimatePresence>
      {row && (
        <motion.aside
          key={row.id}
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.45, ease: EASE }}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-hairline bg-panel p-6"
        >
          <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-hairline p-2 hover:border-fog/40"><X size={16} /></button>
          <p className="label-xs">{row.media_type} · {row.source}</p>
          <h2 className="mt-1 break-all pr-10 text-2xl font-medium">{row.filename ?? row.id}</h2>
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="mt-4 w-full rounded-xl border border-hairline" />
          )}
          <div className="mt-4 flex items-center justify-between">
            <VerdictBadge verdict={row.verdict} status={row.status} size="lg" />
            <span className="mono text-3xl">{pct(row.probability)}</span>
          </div>
          <dl className="mono mt-6 grid gap-2 text-xs">
            {[["created", isoTime(row.created_at)], ["size", bytes(row.file_size)], ["duration", seconds(row.duration_s)], ["sha256", row.sha256 ?? "—"], ["calibrated", String(row.calibrated)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-hairline pb-1"><dt className="text-muted">{k}</dt><dd className="break-all text-right">{v}</dd></div>
            ))}
          </dl>
          {top.length > 0 && (
            <div className="mt-6">
              <p className="label-xs mb-2">Highest suspicion indicators</p>
              <ul className="grid gap-1 text-sm">
                {top.map((i) => <li key={i.id} className="flex justify-between"><span>{i.name}</span><span className="mono">{num(i.score_0_1, 3)}</span></li>)}
              </ul>
            </div>
          )}
          <div className="mt-8"><LiveProjectButton href={`/cases/${row.id}`}>Open full case</LiveProjectButton></div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
