"use client";
import { useArchiveStore } from "@/store/archive-store";
import { Tabs } from "@/components/ui/Tabs";

export function ArchiveFilters({ total, shown }: { total: number; shown: number }) {
  const { filters, setFilter, resetFilters, view, setView, mode, setMode } = useArchiveStore();
  const sel = "rounded-full border border-hairline bg-ink px-3 py-1.5 text-xs text-fog outline-none";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Verdict" className={sel} value={filters.verdict} onChange={(e) => setFilter("verdict", e.target.value as typeof filters.verdict)}>
        <option value="all">All verdicts</option><option value="authentic">Authentic</option><option value="inconclusive">Inconclusive</option><option value="manipulated">Manipulated</option>
      </select>
      <select aria-label="Media type" className={sel} value={filters.media} onChange={(e) => setFilter("media", e.target.value as typeof filters.media)}>
        <option value="all">All media</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option>
      </select>
      <input aria-label="From date" type="date" className={sel} value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
      <input aria-label="To date" type="date" className={sel} value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
      <input aria-label="Search" placeholder="filename or hash" className={`${sel} w-44`} value={filters.q} onChange={(e) => setFilter("q", e.target.value)} />
      <button className="text-xs text-muted hover:text-fog" onClick={resetFilters}>Reset</button>
      {view === "dome" && (
        <button className={`${sel} ${mode === "cluster" ? "border-fog/50" : ""}`} onClick={() => setMode(mode === "cluster" ? "sphere" : "cluster")}>
          {mode === "cluster" ? "Clustered by verdict" : "Cluster by verdict"}
        </button>
      )}
      <span className="mono ml-auto text-xs text-muted">{shown}/{total}</span>
      <Tabs<"dome" | "grid"> tabs={[{ id: "dome", label: "Dome" }, { id: "grid", label: "Grid" }]} value={view} onChange={setView} />
    </div>
  );
}
