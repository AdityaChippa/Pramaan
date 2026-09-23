"use client";
import { useEffect, useRef, useState } from "react";
import { Circle, Mic, Square, Video } from "lucide-react";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import type { MediaType } from "@/types/case";

const LIMITS = { video: 15, audio: 30 } as const;

function pickMime(kind: "video" | "audio"): string {
  const opts = kind === "video" ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"] : ["audio/webm;codecs=opus", "audio/webm"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? opts[opts.length - 1];
}

export function RecordTab({ onFile, onError }: { onFile: (f: File, t: MediaType) => void; onError: (m: string) => void }) {
  const [kind, setKind] = useState<"video" | "audio">("video");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const preview = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timer.current) clearInterval(timer.current);
  };
  useEffect(() => stopStream, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === "video" ? { video: { width: 1280, height: 720 }, audio: true } : { audio: true });
      streamRef.current = stream;
      if (preview.current && kind === "video") {
        preview.current.srcObject = stream;
        await preview.current.play();
      }
      const mime = pickMime(kind);
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stopStream();
        setRecording(false);
        const base = mime.split(";")[0];
        const blob = new Blob(chunks, { type: base });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        onFile(new File([blob], `recording-${stamp}.webm`, { type: base }), kind);
      };
      recRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setElapsed(0);
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setElapsed(s);
        if (s >= LIMITS[kind] && rec.state === "recording") rec.stop();
      }, 200);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not access camera/microphone");
    }
  };

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-6 rounded-2xl border border-hairline p-8">
      <div className="flex gap-2">
        {(["video", "audio"] as const).map((k) => (
          <button key={k} disabled={recording} onClick={() => setKind(k)}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${kind === k ? "border-fog/50 text-fog" : "border-hairline text-muted"}`}>
            {k === "video" ? <Video size={14} /> : <Mic size={14} />} {k === "video" ? `Webcam ≤${LIMITS.video}s` : `Microphone ≤${LIMITS.audio}s`}
          </button>
        ))}
      </div>
      {kind === "video" && <video ref={preview} muted playsInline className="aspect-video w-full max-w-md rounded-xl bg-black object-cover" />}
      <p className="mono text-2xl">{elapsed.toFixed(1)}s / {LIMITS[kind]}s</p>
      {recording ? (
        <LiveProjectButton onClick={() => recRef.current?.stop()}><Square size={14} className="mr-1 inline" />Stop</LiveProjectButton>
      ) : (
        <LiveProjectButton onClick={start}><Circle size={14} className="mr-1 inline text-manipulated" />Start recording</LiveProjectButton>
      )}
    </div>
  );
}
