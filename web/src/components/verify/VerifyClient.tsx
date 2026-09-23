"use client";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { ContactButton } from "@/components/ui/ContactButton";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { sha256Hex, isSha256 } from "@/lib/hashing";
import { isoTime, pct } from "@/lib/format";
import type { Verdict } from "@/types/case";

interface Match { case_id: string; media_type: string; sha256: string; verdict: Verdict | null; probability: number | null; calibrated: boolean; created_at: string; completed_at: string }

export function VerifyClient({ initialHash }: { initialHash: string }) {
  const [hash, setHash] = useState(initialHash);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sha256: string; matches: Match[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = async (h: string) => {
    if (!isSha256(h)) return setErr("Enter a 64-character hexadecimal SHA-256.");
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sha256: h.trim() }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "verification failed");
    setResult(j);
  };

  useEffect(() => {
    if (initialHash && isSha256(initialHash)) check(initialHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 1,
    onDropAccepted: async (files) => {
      setBusy(true);
      const h = await sha256Hex(files[0]);
      setHash(h);
      await check(h);
    },
  });

  return (
    <div className="grid gap-8">
      <div {...getRootProps()} className="grid-hairline cursor-pointer rounded-2xl border border-dashed border-hairline p-10 text-center">
        <input {...getInputProps()} />
        <p className="text-lg">{isDragActive ? "Release to hash" : "Drop the file to verify"}</p>
        <p className="mt-1 text-xs text-muted">The file is hashed in your browser and never uploaded.</p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <input className="input mono text-sm" placeholder="or paste a SHA-256" value={hash} onChange={(e) => setHash(e.target.value)} />
        <ContactButton onClick={() => check(hash)} disabled={busy}>{busy ? "Checking…" : "Verify"}</ContactButton>
      </div>
      {err && <p className="text-sm text-manipulated">{err}</p>}
      {result && (
        result.matches.length ? (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-authentic"><ShieldCheck size={18} />Registered case found for <span className="mono break-all text-xs">{result.sha256}</span></p>
            {result.matches.map((m) => (
              <div key={m.case_id} className="panel grid gap-2 p-5 md:grid-cols-4 md:items-center">
                <VerdictBadge verdict={m.verdict} />
                <p className="mono text-sm">{pct(m.probability, 1)} {m.calibrated ? "" : "(uncalibrated)"}</p>
                <p className="mono text-xs text-muted">{m.media_type} · completed {isoTime(m.completed_at)}</p>
                <p className="mono truncate text-xs text-muted">case {m.case_id}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-muted"><ShieldQuestion size={18} />No shareable case matches this hash. Either it was never analyzed, the owner has not made it shareable, or the file differs by even one byte.</p>
        )
      )}
    </div>
  );
}
