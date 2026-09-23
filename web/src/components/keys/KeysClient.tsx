"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, RefreshCcw, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { ContactButton } from "@/components/ui/ContactButton";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { isoTime } from "@/lib/format";

interface KeyRow { id: string; prefix: string; name: string; monthly_quota: number; last_used_at: string | null; revoked_at: string | null; created_at: string; used_this_month: number }

export function KeysClient() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [period, setPeriod] = useState("");
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/keys", { cache: "no-store" });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setErr(j.error ?? "could not load keys");
    setKeys(j.keys);
    setPeriod(j.period);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setErr(null);
    const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "could not create key");
    setFresh({ key: j.key, name: j.name });
    setName("");
    load();
  };
  const revoke = async (id: string) => {
    if (!confirm("Revoke this key? Requests using it will fail immediately.")) return;
    const r = await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "revoke failed");
    load();
  };
  const rotate = async (id: string) => {
    if (!confirm("Rotate this key? The old key stops working now and a new one is shown once.")) return;
    const r = await fetch(`/api/keys/${id}`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "rotate failed");
    setFresh({ key: j.key, name: j.name });
    load();
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="label-xs">API keys</p><h1 className="text-4xl font-semibold md:text-5xl">Programmatic access</h1></div>
        <LiveProjectButton href="/docs/api">API documentation</LiveProjectButton>
      </header>
      {fresh && (
        <Panel title="New key — copy it now" className="border-inconclusive/50">
          <p className="text-sm text-muted">This is the only time <span className="text-fog">{fresh.name}</span> is shown. {"We"} store only its SHA-256 hash.</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-hairline bg-ink p-3">
            <code className="mono flex-1 break-all text-sm">{fresh.key}</code>
            <CopyButton text={fresh.key} label="Copy" />
          </div>
          <button className="mt-3 text-xs text-muted hover:text-fog" onClick={() => setFresh(null)}>I have stored it safely</button>
        </Panel>
      )}
      <Panel title="Create key">
        <div className="flex flex-col gap-3 md:flex-row">
          <input className="input" placeholder="Key name, e.g. newsroom-ingest" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <ContactButton onClick={create} disabled={!name.trim()}><KeyRound size={14} />Generate</ContactButton>
        </div>
        {err && <p className="mt-3 text-xs text-manipulated">{err}</p>}
      </Panel>
      <Panel title={`Keys · usage for ${period || "this month"}`}>
        {loading ? <p className="text-sm text-muted">Loading…</p> : keys.length === 0 ? <p className="text-sm text-muted">No keys yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="label-xs text-left"><tr className="border-b border-hairline"><th className="py-2">Name</th><th>Prefix</th><th>Usage</th><th>Created</th><th>Last used</th><th>Status</th><th /></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-hairline">
                    <td className="py-2.5">{k.name}</td>
                    <td className="mono text-xs">{k.prefix}…</td>
                    <td className="mono text-xs">
                      {k.used_this_month}/{k.monthly_quota}
                      <div className="mt-1 h-1 w-28 overflow-hidden rounded bg-hairline"><div className="h-full bg-fog" style={{ width: `${Math.min(100, (k.used_this_month / Math.max(1, k.monthly_quota)) * 100)}%` }} /></div>
                    </td>
                    <td className="mono text-xs text-muted">{isoTime(k.created_at).slice(0, 16)}</td>
                    <td className="mono text-xs text-muted">{k.last_used_at ? isoTime(k.last_used_at).slice(0, 16) : "never"}</td>
                    <td className={k.revoked_at ? "text-xs text-manipulated" : "text-xs text-authentic"}>{k.revoked_at ? "revoked" : "active"}</td>
                    <td className="flex justify-end gap-3 py-2.5">
                      {!k.revoked_at && <>
                        <button aria-label="Rotate key" onClick={() => rotate(k.id)} className="text-muted hover:text-fog"><RefreshCcw size={14} /></button>
                        <button aria-label="Revoke key" onClick={() => revoke(k.id)} className="text-muted hover:text-manipulated"><Trash2 size={14} /></button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
