"use client";
import { useRef, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import type { ChatMessageRow } from "@/types/database";
import { cn } from "@/lib/utils";

interface Msg { role: "user" | "assistant"; content: string; grounding_warning?: boolean; pending?: boolean }

export function ChatPanel({ caseId, initialMessages }: { caseId: string; initialMessages: ChatMessageRow[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initialMessages.map((m) => ({ role: m.role, content: m.content, grounding_warning: m.grounding_warning })));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const updateLast = (fn: (m: Msg) => Msg) => setMsgs((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErr(null);
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", pending: true }]);
    try {
      const r = await fetch(`/api/cases/${caseId}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `chat failed (${r.status})`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; grounding_warning?: boolean; message?: string };
          if (ev.type === "delta") updateLast((m) => ({ ...m, content: m.content + (ev.text ?? "") }));
          if (ev.type === "replace") updateLast((m) => ({ ...m, content: ev.text ?? "" }));
          if (ev.type === "done") updateLast((m) => ({ ...m, pending: false, grounding_warning: ev.grounding_warning }));
          if (ev.type === "error") throw new Error(ev.message);
        }
        endRef.current?.scrollIntoView({ block: "nearest" });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "chat failed");
      setMsgs((m) => (m[m.length - 1]?.pending ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Ask about this case" className="flex flex-col">
      <div className="grid max-h-[520px] min-h-[240px] content-start gap-3 overflow-auto pr-1 text-sm">
        {!msgs.length && <p className="text-muted">Questions are answered only from this case&apos;s evidence, e.g. “Why did rPPG push toward fake?”</p>}
        {msgs.map((m, i) => (
          <div key={i} className={cn("max-w-[90%] rounded-2xl px-4 py-2.5", m.role === "user" ? "ml-auto bg-fog text-ink" : "border border-hairline")}>
            <p className="whitespace-pre-wrap">{m.content || (m.pending ? "…" : "")}</p>
            {m.grounding_warning && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-inconclusive"><AlertTriangle size={11} />contains numbers not verified against the evidence</p>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-4 flex gap-2">
        <input className="input text-sm" placeholder="Ask a question…" value={input} maxLength={2000}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={send} disabled={busy || !input.trim()} aria-label="Send" className="grid w-12 place-items-center rounded-xl border border-hairline hover:border-fog/50 disabled:opacity-40"><Send size={16} /></button>
      </div>
      {err && <p className="mt-2 text-xs text-manipulated">{err}</p>}
    </Panel>
  );
}
