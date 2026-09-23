import "server-only";
import { serverEnv } from "@/lib/env";

async function engineFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const env = serverEnv();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    return await fetch(`${env.ENGINE_URL.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "content-type": "application/json", "x-engine-secret": env.ENGINE_SHARED_SECRET, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface EngineHealth {
  status: string;
  uptime_s: number;
  models: { loading: boolean; versions: Record<string, string>; errors: Record<string, string>; fusion_calibrated: boolean };
  queue: { inflight: number; workers: number };
}

export async function engineHealth(): Promise<{ ok: true; health: EngineHealth } | { ok: false; error: string }> {
  try {
    const r = await engineFetch("/health", { method: "GET", timeoutMs: 8000 });
    if (!r.ok) return { ok: false, error: `engine responded ${r.status}` };
    return { ok: true, health: (await r.json()) as EngineHealth };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "engine unreachable" };
  }
}

/** Fire-and-return: the engine replies 202 and streams progress into case_events. */
export async function engineAnalyze(caseId: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const r = await engineFetch("/analyze", { method: "POST", body: JSON.stringify({ case_id: caseId }), timeoutMs: 20000 });
    if (r.status === 202 || r.status === 409) return { ok: true, status: r.status };
    return { ok: false, status: r.status, error: await r.text() };
  } catch (e) {
    return { ok: false, status: 503, error: e instanceof Error ? e.message : "engine unreachable" };
  }
}

export async function engineLiveAnalyze(body: { session_id: string; chunk_index: number; chunk_path: string; t_start: number }) {
  const r = await engineFetch("/live/analyze", { method: "POST", body: JSON.stringify(body), timeoutMs: 55000 });
  const data = await r.json().catch(() => ({ detail: "invalid engine response" }));
  return { status: r.status, data };
}

export async function engineLiveFinalize(sessionId: string) {
  const r = await engineFetch("/live/finalize", { method: "POST", body: JSON.stringify({ session_id: sessionId }), timeoutMs: 55000 });
  const data = await r.json().catch(() => ({ detail: "invalid engine response" }));
  return { status: r.status, data };
}
