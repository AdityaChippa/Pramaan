"use client";
import { useEffect, useRef, useState } from "react";
import type { EngineHealth } from "@/lib/engine";

export type EngineState = "checking" | "waking" | "ready";

/** Pings the engine (via /api/engine/health) until it answers; HF Spaces can take a while to cold-start. */
export function useEngineHealth() {
  const [state, setState] = useState<EngineState>("checking");
  const [elapsed, setElapsed] = useState(0);
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    const ping = async () => {
      try {
        const r = await fetch("/api/engine/health", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j.ok) {
          setHealth(j.health);
          setState("ready");
          setError(null);
          timer = setTimeout(ping, 60000);
          return;
        }
        setError(j.error ?? "engine not responding");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "network error");
      }
      if (!cancelled) {
        setState("waking");
        timer = setTimeout(ping, 3000);
      }
    };
    ping();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  return { state, elapsed, health, error };
}
