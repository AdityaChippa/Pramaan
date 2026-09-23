"use client";
import { useMemo, useState } from "react";
import type { CaseArtifacts } from "@/types/case";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

interface View { id: string; label: string; overlay: string; original: string | null }

export function HeatmapViewer({ artifacts, signed, focusPath }: { artifacts: CaseArtifacts; signed: Record<string, string>; focusPath?: string | null }) {
  const views: View[] = useMemo(() => {
    const v: View[] = artifacts.top_frames.map((f, i) => ({ id: `top-${i}`, label: `Frame ${f.frame_index} · t=${num(f.t, 2)}s · p=${num(f.p, 3)}`, overlay: f.overlay_path, original: f.original_path }));
    for (const o of artifacts.overlays) {
      if (o.id.startsWith("frame_cam_")) continue;
      v.push({ id: o.id, label: o.label, overlay: o.path, original: o.original_path ?? null });
    }
    return v;
  }, [artifacts]);
  const [sel, setSel] = useState(0);
  const [split, setSplit] = useState(55);
  const [opacity, setOpacity] = useState(100);
  const focusIdx = focusPath ? views.findIndex((v) => v.overlay === focusPath) : -1;
  const idx = focusIdx >= 0 && focusIdx !== sel ? focusIdx : sel;
  const view = views[idx];

  if (!view) return <p className="text-sm text-muted">No visual evidence artifacts for this media type.</p>;
  const overlayUrl = signed[view.overlay];
  const originalUrl = view.original ? signed[view.original] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-black">
        {overlayUrl ? (
          <div className="relative">
            {originalUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={originalUrl} alt="Original" className="block w-full select-none" draggable={false} />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={overlayUrl} alt={view.label} draggable={false}
              className={cn("block w-full select-none", originalUrl && "absolute inset-0 h-full")}
              style={{ opacity: opacity / 100, clipPath: originalUrl ? `inset(0 0 0 ${split}%)` : undefined }} />
            {originalUrl && <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80" style={{ left: `${split}%` }} />}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted">Signing artifact URL…</div>
        )}
      </div>
      <div className="grid content-start gap-4">
        {originalUrl && (
          <label className="grid gap-1 text-xs"><span className="label-xs">Original ↔ overlay</span>
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} /></label>
        )}
        <label className="grid gap-1 text-xs"><span className="label-xs">Overlay opacity <span className="mono">{opacity}%</span></span>
          <input type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
        <div className="grid max-h-[360px] gap-1 overflow-auto">
          {views.map((v, i) => (
            <button key={v.id} onClick={() => setSel(i)}
              className={cn("rounded-lg border px-3 py-2 text-left text-xs", i === idx ? "border-fog/50 bg-fog/5" : "border-hairline text-muted hover:text-fog")}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
