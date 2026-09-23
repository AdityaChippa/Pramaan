"use client";
import { useEffect, useMemo, useState } from "react";
import { DomeScene } from "@/components/three";
import type { AtlasCard } from "@/components/three/cardAtlas";
import { useArchiveStore } from "@/store/archive-store";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useIsMobile } from "@/hooks/useIsMobile";
import { VERDICT_META } from "@/config/indicators";
import type { CaseRow } from "@/types/case";
import { pct } from "@/lib/format";
import { ArchiveDrawer } from "./ArchiveDrawer";
import { ArchiveFilters } from "./ArchiveFilters";
import { ArchiveGrid } from "./ArchiveGrid";

const MAX_DOME = 300;

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function ArchiveClient({ rows }: { rows: CaseRow[] }) {
  const { filters, view, setView, selected, select, mode } = useArchiveStore();
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [gl, setGl] = useState(true);

  useEffect(() => setGl(webglAvailable()), []);
  useEffect(() => { if (reduced || mobile || !gl) setView("grid"); }, [reduced, mobile, gl, setView]);

  useEffect(() => {
    const paths = rows.map((r) => r.artifacts?.thumbnail_path).filter((p): p is string => !!p);
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
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) =>
      (filters.verdict === "all" || r.verdict === filters.verdict) &&
      (filters.media === "all" || r.media_type === filters.media) &&
      (!filters.from || r.created_at >= filters.from) &&
      (!filters.to || r.created_at.slice(0, 10) <= filters.to) &&
      (!q || (r.filename ?? "").toLowerCase().includes(q) || (r.sha256 ?? "").startsWith(q)));
  }, [rows, filters]);

  const domeRows = filtered.slice(0, MAX_DOME);
  const signedReady = domeRows.every((r) => !r.artifacts?.thumbnail_path || signed[r.artifacts.thumbnail_path]);
  const cards: AtlasCard[] = useMemo(() => domeRows.map((r) => ({
    id: r.id,
    verdict: r.verdict,
    label: r.verdict ? VERDICT_META[r.verdict].label : r.status,
    confidence: pct(r.probability),
    mediaType: r.media_type,
    date: r.created_at.slice(0, 10),
    color: r.verdict ? VERDICT_META[r.verdict].color : "#6b7280",
    seed: r.sha256 ?? r.id,
    imageUrl: r.artifacts?.thumbnail_path ? signed[r.artifacts.thumbnail_path] ?? null : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [domeRows.map((r) => r.id).join(","), signedReady]);

  const selectedRow = rows.find((r) => r.id === selected) ?? null;

  return (
    <div className="grid gap-4">
      <header>
        <p className="label-xs">Archive</p>
        <h1 className="text-4xl font-semibold md:text-5xl">Evidence dome</h1>
      </header>
      <ArchiveFilters total={rows.length} shown={filtered.length} />
      {rows.length === 0 ? (
        <p className="panel p-10 text-muted">No cases yet. Analyze media to populate the archive.</p>
      ) : view === "dome" && gl ? (
        <div className="relative h-[72vh] overflow-hidden rounded-3xl border border-hairline">
          {signedReady ? <DomeScene cards={cards} mode={mode} onSelect={select} className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-sm text-muted">Signing thumbnails…</div>}
          <p className="pointer-events-none absolute bottom-4 left-4 text-xs text-muted">Drag to look around · scroll to zoom · click a card{filtered.length > MAX_DOME ? ` · showing newest ${MAX_DOME}` : ""}</p>
        </div>
      ) : (
        <ArchiveGrid rows={filtered} signed={signed} onSelect={select} />
      )}
      <ArchiveDrawer row={selectedRow} signed={signed} onClose={() => select(null)} />
    </div>
  );
}
