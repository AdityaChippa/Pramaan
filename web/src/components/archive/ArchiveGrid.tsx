"use client";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import type { CaseRow } from "@/types/case";
import { isoTime, pct } from "@/lib/format";

export function ArchiveGrid({ rows, signed, onSelect }: { rows: CaseRow[]; signed: Record<string, string>; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      {rows.map((r) => {
        const thumb = r.artifacts?.thumbnail_path ? signed[r.artifacts.thumbnail_path] : undefined;
        return (
          <button key={r.id} onClick={() => onSelect(r.id)} className="panel group overflow-hidden text-left transition hover:border-fog/40">
            <div className="aspect-square bg-black">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
              ) : <div className="flex h-full items-center justify-center text-xs text-muted">{r.media_type}</div>}
            </div>
            <div className="grid gap-1 p-3">
              <VerdictBadge verdict={r.verdict} status={r.status} />
              <p className="truncate text-xs">{r.filename ?? r.id}</p>
              <p className="mono text-[10px] text-muted">{pct(r.probability)} · {isoTime(r.created_at).slice(0, 10)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
