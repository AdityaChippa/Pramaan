"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs text-muted transition hover:text-fog"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {label ?? (done ? "Copied" : "Copy")}
    </button>
  );
}
