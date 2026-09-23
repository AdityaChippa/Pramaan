"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { ContactButton } from "@/components/ui/ContactButton";
import type { CaseRow } from "@/types/case";
import type { CaseStats } from "@/types/database";
import { bytes, isoTime, pct, shortHash } from "@/lib/format";

export function CasesClient({ rows: initial, stats }: { rows: CaseRow[]; stats: CaseStats | null }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status || r.verdict === status) &&
      (!s || (r.filename ?? "").toLowerCase().includes(s) || r.id.startsWith(s) || (r.sha256 ?? "").startsWith(s)));
  }, [rows, q, status]);

  const remove = async (id: string) => {
    if (!confirm("Delete this case, its uploaded media, overlays and reports? This cannot be undone.")) return;
    const r = await fetch(`/api/cases/${id}`, { method: "DELETE" });
    if (r.ok) setRows((x) => x.filter((c) => c.id !== id));
    else setErr((await r.json().catch(() => ({}))).error ?? "delete failed");
  };

  const statCells: [string, number | string][] = stats ? [
    ["Total", stats.total], ["Complete", stats.complete], ["In progress", stats.in_progress], ["Failed", stats.failed],
    ["Authentic", stats.authentic], ["Inconclusive", stats.inconclusive], ["Manipulated", stats.manipulated], ["Mean p", pct(stats.mean_probability)],
  ] : [];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="label-xs">Cases</p><h1 className="text-4xl font-semibold md:text-5xl">Case register</h1></div>
        <ContactButton href="/analyze">New analysis</ContactButton>
      </header>
      {statCells.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-8">
          {statCells.map(([k, v]) => <div key={k} className="bg-ink p-4"><p className="label-xs">{k}</p><p className="mono mt-1 text-2xl">{v}</p></div>)}
        </div>
      )}
      <Panel
        title={`${filtered.length} cases`}
        action={
          <div className="flex gap-2">
            <select aria-label="Status filter" className="rounded-full border border-hairline bg-ink px-3 py-1.5 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option><option value="complete">Complete</option><option value="processing">Processing</option><option value="queued">Queued</option>
              <option value="failed">Failed</option><option value="authentic">Authentic</option><option value="inconclusive">Inconclusive</option><option value="manipulated">Manipulated</option>
            </select>
            <input aria-label="Search cases" className="rounded-full border border-hairline bg-ink px-3 py-1.5 text-xs" placeholder="filename, id or hash" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        {err && <p className="mb-3 text-xs text-manipulated">{err}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="label-xs text-left"><tr className="border-b border-hairline"><th className="py-2">File</th><th>Type</th><th>Verdict</th><th className="text-right">p</th><th className="pl-4">SHA-256</th><th>Size</th><th>Created</th><th /></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-hairline hover:bg-fog/5">
                  <td className="max-w-[240px] truncate py-2.5"><Link className="hover:underline" href={`/cases/${r.id}`}>{r.filename ?? r.id}</Link></td>
                  <td className="text-xs text-muted">{r.media_type} · {r.source}</td>
                  <td><VerdictBadge verdict={r.verdict} status={r.status} /></td>
                  <td className="mono text-right">{pct(r.probability)}</td>
                  <td className="mono pl-4 text-xs text-muted">{shortHash(r.sha256, 8)}</td>
                  <td className="mono text-xs">{bytes(r.file_size)}</td>
                  <td className="mono text-xs text-muted">{isoTime(r.created_at).slice(0, 16)}</td>
                  <td className="text-right"><button aria-label="Delete case" onClick={() => remove(r.id)} className="text-muted hover:text-manipulated"><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} className="py-8 text-center text-muted">No cases match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
