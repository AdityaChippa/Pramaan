"use client";
import { useEffect, useRef } from "react";
import { Radio, Square } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { ContactButton } from "@/components/ui/ContactButton";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { EngineStatus } from "@/components/analyze/EngineStatus";
import { VerdictGauge } from "@/components/result/VerdictGauge";
import { uploadWithProgress } from "@/components/analyze/submit";
import { useLiveStore, type LiveWindow } from "@/store/live-store";
import { num } from "@/lib/format";
import type { Verdict } from "@/types/case";

const CHUNK_MS = 3000;
const MAX_PENDING = 3;
const IND = [
  { id: "face_cnn", label: "Face CNN" },
  { id: "blink", label: "Blink" },
  { id: "landmark_jitter", label: "Landmark jitter" },
  { id: "aasist", label: "AASIST-L" },
] as const;

function mimeFor(): string {
  const opts = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

/** Rolling mean in log-odds space over the last k scored windows. */
function rolling(windows: LiveWindow[], k = 3): number | null {
  const ps = windows.map((w) => w.scores?.probability).filter((p): p is number => typeof p === "number").slice(-k);
  if (!ps.length) return null;
  const z = ps.reduce((a, p) => a + Math.log(Math.min(Math.max(p, 1e-4), 1 - 1e-4) / (1 - Math.min(Math.max(p, 1e-4), 1 - 1e-4))), 0) / ps.length;
  return 1 / (1 + Math.exp(-z));
}

export function LiveClient() {
  const s = useLiveStore();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const loop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = useRef(0);

  const teardown = () => {
    if (loop.current) clearTimeout(loop.current);
    loop.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => { teardown(); useLiveStore.getState().reset(); }, []);

  const processChunk = async (blob: Blob, i: number, t: number, sessionId: string) => {
    const st = useLiveStore.getState();
    if (st.pending >= MAX_PENDING) return st.drop(); // engine behind real time: skip rather than queue unboundedly
    st.addPending();
    const t0 = performance.now();
    try {
      const type = blob.type.split(";")[0] || "video/webm";
      const signed = await fetch("/api/live/chunk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, chunk_index: i, t_start: t, mime_type: type }) });
      const sj = await signed.json();
      if (!signed.ok) throw new Error(sj.error ?? "chunk signing failed");
      await uploadWithProgress(sj.signedUrl, new File([blob], `${i}.webm`, { type }), () => undefined);
      const r = await fetch("/api/live/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, chunk_index: i, chunk_path: sj.path, t_start: t }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "analysis failed");
      useLiveStore.getState().resolveWindow({ index: i, t, scores: j, error: null, latencyMs: Math.round(performance.now() - t0) });
    } catch (e) {
      useLiveStore.getState().resolveWindow({ index: i, t, scores: null, error: e instanceof Error ? e.message : "failed", latencyMs: null });
    }
  };

  const start = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 15 }, audio: { channelCount: 1 } });
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      const r = await fetch("/api/live/sessions", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "could not start session");
      useLiveStore.getState().start(j.id);
      index.current = 0;
      const mime = mimeFor();
      // Stop/start per chunk so every chunk is a standalone, decodable WebM with its own header.
      const record = () => {
        if (!stream.current || !useLiveStore.getState().running) return;
        const i = index.current++;
        const t = (i * CHUNK_MS) / 1000;
        const parts: Blob[] = [];
        const rec = new MediaRecorder(stream.current, { mimeType: mime });
        recorder.current = rec;
        rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
        rec.onstop = () => { if (parts.length) processChunk(new Blob(parts, { type: mime }), i, t, j.id); };
        rec.start();
        loop.current = setTimeout(() => { if (rec.state === "recording") rec.stop(); record(); }, CHUNK_MS);
      };
      record();
    } catch (e) {
      teardown();
      useLiveStore.getState().setError(e instanceof Error ? e.message : "could not access camera/microphone");
    }
  };

  const stop = async () => {
    const id = useLiveStore.getState().sessionId;
    useLiveStore.getState().stop();
    teardown();
    if (!id) return;
    for (let k = 0; k < 40 && useLiveStore.getState().pending > 0; k++) await new Promise((r) => setTimeout(r, 500));
    const r = await fetch(`/api/live/sessions/${id}`, { method: "POST" });
    const j = await r.json();
    if (r.ok && j.case_id) useLiveStore.getState().setFinal(j.case_id);
    else useLiveStore.getState().setError(j.error ?? "could not finalize session");
  };

  const scored = s.windows.filter((w) => w.scores);
  const last = scored[scored.length - 1]?.scores ?? null;
  const pRoll = rolling(s.windows);
  const thresholds = last?.thresholds ?? null;
  const verdict: Verdict | null = pRoll === null || !thresholds ? null : pRoll >= thresholds.t_high ? "manipulated" : pRoll <= thresholds.t_low ? "authentic" : "inconclusive";
  const recent = s.windows.filter((w) => w.t >= Math.max(0, (s.windows[s.windows.length - 1]?.t ?? 0) - 60));
  const latencies = s.windows.map((w) => w.latencyMs).filter((x): x is number => x !== null);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="label-xs">Live monitor</p><h1 className="text-4xl font-semibold md:text-5xl">Real-time screening</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">Webcam and microphone are analyzed in 3-second windows with the lightweight live model set. Chunks are deleted automatically after 24 h.</p></div>
        <EngineStatus />
      </header>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel title="Capture" action={s.running ? <span className="flex items-center gap-2 text-xs text-manipulated"><Radio size={14} className="animate-pulse" />recording</span> : undefined}>
          <video ref={video} muted playsInline className="aspect-video w-full rounded-xl bg-black object-cover" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {s.running ? <LiveProjectButton onClick={stop}><Square size={12} className="mr-1 inline" />Stop & create case</LiveProjectButton>
              : <ContactButton onClick={start}>Start Live Monitor</ContactButton>}
            {s.finalCaseId && <LiveProjectButton href={`/cases/${s.finalCaseId}`}>Open session case</LiveProjectButton>}
            <span className="mono text-xs text-muted">windows {scored.length} · pending {s.pending} · skipped {s.dropped}{latencies.length ? ` · latency ${Math.round(latencies.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, latencies.length))} ms` : ""}</span>
          </div>
          {s.error && <p className="mt-3 text-xs text-manipulated">{s.error}</p>}
        </Panel>
        <Panel title="Rolling risk (last 3 windows)">
          <VerdictGauge probability={pRoll} verdict={verdict} thresholds={thresholds} />
          <div className="mt-2 flex justify-center"><VerdictBadge verdict={verdict} /></div>
          <div className="mt-6 grid gap-3">
            {IND.map((ind) => {
              const vals = s.windows.map((w) => w.scores?.indicators[ind.id]?.score ?? null);
              const cur = last?.indicators[ind.id];
              return (
                <div key={ind.id} className="grid grid-cols-[120px_1fr_90px] items-center gap-3 text-xs">
                  <span>{ind.label}</span>
                  <Sparkline values={vals.slice(-20)} color="#B600A8" />
                  <span className="mono text-right text-muted">{cur?.status === "ok" ? num(cur.score, 3) : cur?.reason ? "n/a" : "—"}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <Panel title="60-second timeline">
        {recent.length ? (
          <SeriesChart data={recent.map((w) => ({ t: w.t, p: w.scores?.probability ?? null }))} xKey="t" xLabel="session seconds" yDomain={[0, 1]}
            series={[{ key: "p", label: "window p(manipulated)", color: "#FF4D5E" }]}
            refLines={thresholds ? [{ y: thresholds.t_high, label: "t_high" }, { y: thresholds.t_low, label: "t_low" }] : []} />
        ) : <p className="text-sm text-muted">No windows analyzed yet.</p>}
        {s.windows.some((w) => w.error) && <p className="mono mt-2 text-[11px] text-manipulated">last error: {s.windows.filter((w) => w.error).slice(-1)[0].error}</p>}
      </Panel>
    </div>
  );
}
