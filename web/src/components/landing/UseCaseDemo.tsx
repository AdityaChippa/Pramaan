"use client";
import { Check } from "lucide-react";
import { VerdictGauge } from "@/components/result/VerdictGauge";
import { PIPELINE_STEPS } from "@/config/indicators";
import type { IndicatorCatalogRow } from "@/types/database";
import type { ShowcaseItem } from "./ShowcaseMarquee";

/**
 * Renders the module's real UI components. The gauge shows a real public-showcase case of the matching
 * media type when one exists; otherwise it renders its empty state — never invented numbers.
 */
export function UseCaseDemo({ steps, indicators, example }: { steps: string[]; indicators: IndicatorCatalogRow[]; example: ShowcaseItem | null }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="panel flex flex-col items-center justify-center p-4">
        <VerdictGauge probability={example?.probability ?? null} verdict={example?.verdict ?? null}
          thresholds={{ t_low: 0.3, t_high: 0.7, target_fpr: 0.05, calibrated: example?.calibrated ?? false }} />
        <p className="mt-2 text-center text-[11px] text-muted">{example ? "public showcase case" : "no public case of this type yet"}</p>
      </div>
      <div className="panel p-4">
        <p className="label-xs mb-2">Pipeline</p>
        <ul className="grid gap-1 text-xs">
          {PIPELINE_STEPS.filter((s) => steps.includes(s.step)).map((s) => (
            <li key={s.step} className="flex items-center gap-2 rounded-lg border border-hairline px-2 py-1.5"><Check size={12} className="text-muted" />{s.label}</li>
          ))}
        </ul>
      </div>
      <div className="panel p-4">
        <p className="label-xs mb-2">Indicators</p>
        <ul className="grid gap-2 text-xs">
          {indicators.map((i) => (
            <li key={i.id} className="border-b border-hairline pb-1.5">
              <p className="text-fog">{i.name}</p>
              <p className="mono text-[10px] text-muted">{i.expected_range}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
