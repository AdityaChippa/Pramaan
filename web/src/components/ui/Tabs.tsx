"use client";
import { cn } from "@/lib/utils";

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-hairline p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("rounded-full px-4 py-1.5 text-sm transition", value === t.id ? "bg-fog text-ink" : "text-muted hover:text-fog")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
