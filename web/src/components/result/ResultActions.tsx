"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Link2, RefreshCcw, Share2, Sparkles } from "lucide-react";
import type { CaseRow } from "@/types/case";
import { cn } from "@/lib/utils";

export function ResultActions({ row, siteUrl, onChange }: { row: CaseRow; siteUrl: string; onChange: (p: Partial<CaseRow>) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = async (field: "is_shareable" | "is_public_showcase") => {
    setBusy(field);
    const r = await fetch(`/api/cases/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: !row[field] }) });
    const j = await r.json();
    setBusy(null);
    if (r.ok) onChange({ [field]: j[field] });
    else setMsg(j.error ?? "update failed");
  };

  const copyVerify = async () => {
    if (!row.sha256) return;
    await navigator.clipboard.writeText(`${siteUrl}/verify?sha256=${row.sha256}`);
    setMsg(row.is_shareable ? "Verification link copied." : "Link copied — enable sharing so the verify page can confirm this case.");
  };

  const reanalyze = async () => {
    setBusy("reanalyze");
    const r = await fetch(`/api/cases/${row.id}/reanalyze`, { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setMsg(j.error ?? "re-analysis failed");
    router.push(`/cases/${j.case_id}`);
  };

  const btn = "inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-xs transition hover:border-fog/50 disabled:opacity-40";
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <a className={btn} href={`/api/cases/${row.id}/pdf`} aria-disabled={row.status !== "complete"}><Download size={14} />Download PDF</a>
        <button className={btn} onClick={copyVerify} disabled={!row.sha256}><Link2 size={14} />Copy verification link</button>
        <button className={cn(btn, row.is_shareable && "border-authentic/50 text-authentic")} onClick={() => toggle("is_shareable")} disabled={busy !== null}>
          <Share2 size={14} />{row.is_shareable ? "Shareable" : "Private"}
        </button>
        <button className={cn(btn, row.is_public_showcase && "border-authentic/50 text-authentic")} onClick={() => toggle("is_public_showcase")} disabled={busy !== null || row.status !== "complete"}>
          <Sparkles size={14} />{row.is_public_showcase ? "In landing showcase" : "Add to showcase"}
        </button>
        <button className={btn} onClick={reanalyze} disabled={busy !== null || !row.file_path}><RefreshCcw size={14} />{busy === "reanalyze" ? "Creating…" : "Re-analyze with latest models"}</button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
