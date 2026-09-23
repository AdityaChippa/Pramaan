"use client";
import { useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import type { GroqDoc } from "@/types/case";
import { isoTime } from "@/lib/format";

type Doc = GroqDoc & { unsupported_numbers?: number[] };

function Meta({ doc }: { doc: Doc }) {
  return (
    <p className="mono mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted">
      {doc.model} · {isoTime(doc.generated_at)}
      {doc.grounding_warning && (
        <span className="inline-flex items-center gap-1 text-inconclusive"><AlertTriangle size={12} />grounding warning: unverified numbers {(doc.unsupported_numbers ?? []).join(", ")}</span>
      )}
    </p>
  );
}

function List({ items }: { items: unknown }) {
  if (!Array.isArray(items)) return null;
  return <ul className="ml-4 list-disc space-y-1">{items.map((x, i) => <li key={i}>{String(x)}</li>)}</ul>;
}

export function GroqPanels({ caseId, report, summary }: { caseId: string; report: GroqDoc | null; summary: GroqDoc | null }) {
  const [rep, setRep] = useState<Doc | null>(report as Doc | null);
  const [sum, setSum] = useState<Doc | null>(summary as Doc | null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const gen = async (kind: "report" | "summary", regenerate: boolean) => {
    setBusy(kind);
    setErr(null);
    const r = await fetch(`/api/cases/${caseId}/${kind}${regenerate ? "?regenerate=1" : ""}`, { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setErr(j.error ?? `${kind} generation failed`);
    (kind === "report" ? setRep : setSum)(j);
  };

  const btn = "inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-xs hover:border-fog/50 disabled:opacity-40";
  const s = sum?.content as { headline?: string; summary?: string; recommended_next_step?: string } | undefined;
  const c = rep?.content as { title?: string; overall_assessment?: string; findings?: { indicator_name?: string; observation?: string; interpretation?: string }[]; fusion_explanation?: string; limitations?: string[]; what_would_change_conclusion?: string[] } | undefined;

  return (
    <div className="grid gap-6">
      <Panel title="Executive summary (Groq)" action={<button className={btn} disabled={busy !== null} onClick={() => gen("summary", !!sum)}><RefreshCcw size={12} />{sum ? "Regenerate" : busy === "summary" ? "Generating…" : "Generate"}</button>}>
        {s ? (
          <div className="text-sm leading-relaxed">
            <p className="text-xl font-medium">{s.headline}</p>
            <p className="mt-3 text-fog/90">{s.summary}</p>
            {s.recommended_next_step && <p className="mt-3 text-muted"><span className="label-xs mr-2">Next step</span>{s.recommended_next_step}</p>}
            <Meta doc={sum!} />
          </div>
        ) : <p className="text-sm text-muted">Not generated yet. The summary is written only from this case&apos;s stored evidence.</p>}
      </Panel>
      <Panel title="Technical forensic report (Groq)" action={<button className={btn} disabled={busy !== null} onClick={() => gen("report", !!rep)}><RefreshCcw size={12} />{rep ? "Regenerate" : busy === "report" ? "Generating…" : "Generate"}</button>}>
        {c ? (
          <div className="grid gap-4 text-sm leading-relaxed">
            <p className="text-lg font-medium">{c.title}</p>
            <p>{c.overall_assessment}</p>
            <div className="grid gap-3">
              {(c.findings ?? []).map((f, i) => (
                <div key={i} className="rounded-xl border border-hairline p-3">
                  <p className="font-medium">{f.indicator_name}</p>
                  <p className="mt-1 text-fog/90">{f.observation}</p>
                  <p className="mt-1 text-muted">{f.interpretation}</p>
                </div>
              ))}
            </div>
            {c.fusion_explanation && <div><p className="label-xs mb-1">Fusion</p><p>{c.fusion_explanation}</p></div>}
            <div><p className="label-xs mb-1">Limitations</p><List items={c.limitations} /></div>
            <div><p className="label-xs mb-1">What would change the conclusion</p><List items={c.what_would_change_conclusion} /></div>
            <Meta doc={rep!} />
          </div>
        ) : <p className="text-sm text-muted">Not generated yet.</p>}
        {err && <p className="mt-3 text-xs text-manipulated">{err}</p>}
      </Panel>
    </div>
  );
}
