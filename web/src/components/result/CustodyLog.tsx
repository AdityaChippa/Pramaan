"use client";
import { Fragment, useState } from "react";
import type { CaseEvent, CaseRow } from "@/types/case";
import { durationMs, isoTime } from "@/lib/format";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = { ok: "text-authentic", error: "text-manipulated", skipped: "text-muted", started: "text-inconclusive" };

export function CustodyLog({ row, events }: { row: CaseRow; events: CaseEvent[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="grid gap-4">
      <dl className="mono grid gap-2 text-xs md:grid-cols-2">
        <div className="rounded-lg border border-hairline p-3">
          <dt className="label-xs mb-1 flex justify-between font-sans">SHA-256 (engine){row.sha256 && <CopyButton text={row.sha256} />}</dt>
          <dd className="break-all">{row.sha256 ?? "—"}</dd>
          {row.client_sha256 && <dd className={cn("mt-1", row.client_sha256 === row.sha256 ? "text-authentic" : "text-muted")}>
            browser hash {row.client_sha256 === row.sha256 ? "matches" : row.sha256 ? "differs" : "recorded"}</dd>}
        </div>
        <div className="rounded-lg border border-hairline p-3">
          <dt className="label-xs mb-1 font-sans">pHash (64-bit DCT)</dt>
          <dd>{row.phash ?? "—"}</dd>
          <dd className="mt-1 text-muted">created {isoTime(row.created_at)} · completed {isoTime(row.completed_at)}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto">
        <table className="mono w-full min-w-[700px] text-xs">
          <thead className="label-xs text-left font-sans">
            <tr className="border-b border-hairline"><th className="py-2">#</th><th>step</th><th>status</th><th>started (UTC)</th><th className="text-right">duration</th></tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <Fragment key={e.id}>
                <tr className="cursor-pointer border-b border-hairline hover:bg-fog/5" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <td className="py-2 text-muted">{i + 1}</td>
                  <td>{e.step}</td>
                  <td className={STATUS_COLOR[e.status]}>{e.status}</td>
                  <td>{isoTime(e.started_at)}</td>
                  <td className="text-right">{durationMs(e.started_at, e.finished_at)}</td>
                </tr>
                {open === e.id && (
                  <tr className="border-b border-hairline"><td colSpan={5} className="p-3">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-muted">{JSON.stringify(e.detail, null, 2)}</pre>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!events.length && <tr><td colSpan={5} className="py-3 text-muted">No custody events recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
