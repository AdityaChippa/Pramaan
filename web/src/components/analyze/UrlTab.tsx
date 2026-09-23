"use client";
import { useState } from "react";
import { ContactButton } from "@/components/ui/ContactButton";

export function UrlTab({ preset, onCase, onError }: { preset: string | null; onCase: (id: string) => void; onError: (m: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/ingest/url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, preset }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `ingest failed (${r.status})`);
      if (!j.dispatched) throw new Error(`File stored as case ${j.case_id}, but the engine did not accept the job: ${j.engine_error}`);
      onCase(j.case_id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "ingest failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-[280px] flex-col justify-center gap-4 rounded-2xl border border-hairline p-8">
      <label className="label-xs" htmlFor="media-url">Direct media URL</label>
      <input id="media-url" className="input mono text-sm" placeholder="https://example.org/clip.mp4" value={url} onChange={(e) => setUrl(e.target.value)} />
      <p className="text-xs text-muted">Fetched server-side with content-type and size validation. Private and reserved IP ranges are blocked.</p>
      <div>
        <ContactButton onClick={submit} disabled={busy || !/^https?:\/\//.test(url)}>{busy ? "Fetching…" : "Fetch & analyze"}</ContactButton>
      </div>
    </div>
  );
}
