"use client";
import { useEngineHealth } from "@/hooks/useEngineHealth";
import { cn } from "@/lib/utils";

export function EngineStatus() {
  const { state, elapsed, health, error } = useEngineHealth();
  const loaded = health ? Object.keys(health.models.versions).length : 0;
  const color = state === "ready" ? "bg-authentic" : state === "waking" ? "bg-inconclusive animate-pulse" : "bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-full border border-hairline px-4 py-2 text-xs">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {state === "ready" && health ? (
        <span className="text-fog">
          Engine ready · <span className="mono">{loaded}/4</span> models loaded
          {health.models.loading && " · loading models"}
          {!health.models.fusion_calibrated && <span className="ml-2 text-inconclusive">Uncalibrated defaults</span>}
        </span>
      ) : state === "waking" ? (
        <span className="text-fog">
          Engine waking up · <span className="mono">{elapsed}s</span>
          {error && <span className="ml-2 text-muted">({error})</span>}
        </span>
      ) : (
        <span className="text-muted">Checking engine…</span>
      )}
    </div>
  );
}
