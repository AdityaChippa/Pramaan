import { VERDICT_META } from "@/config/indicators";
import type { CaseStatus, Verdict } from "@/types/case";
import { cn } from "@/lib/utils";

export function VerdictBadge({ verdict, status, className, size = "sm" }: { verdict: Verdict | null; status?: CaseStatus; className?: string; size?: "sm" | "lg" }) {
  if (!verdict) {
    const label = status === "failed" ? "Failed" : status === "complete" ? "No verdict" : status ? status[0].toUpperCase() + status.slice(1) : "—";
    return <span className={cn("inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-xs text-muted", className)}>{label}</span>;
  }
  const m = VERDICT_META[verdict];
  return (
    <span
      className={cn("inline-flex items-center gap-2 rounded-full border font-medium", size === "lg" ? "px-5 py-2 text-lg" : "px-3 py-1 text-xs", className)}
      style={{ borderColor: `${m.color}55`, color: m.color, background: `${m.color}12` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}
