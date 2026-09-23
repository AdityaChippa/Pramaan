import Link from "next/link";
import type { ModelRegistryRow } from "@/types/database";

function metric(m: Record<string, unknown>, k: string): string | null {
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : null;
}

export function ModelStrip({ models }: { models: ModelRegistryRow[] }) {
  return (
    <section className="mx-auto max-w-[1600px] px-5 py-28 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-4xl font-semibold md:text-6xl">Model transparency</h2>
        <Link href="/model" className="text-sm text-muted underline-offset-4 hover:text-fog hover:underline">Full model card →</Link>
      </div>
      {models.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-hairline p-8 text-muted">Not trained yet — no active model versions are registered.</p>
      ) : (
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-4">
          {models.map((m) => {
            const met = (m.metrics ?? {}) as Record<string, unknown>;
            const auc = metric(met, "auc");
            const eer = metric(met, "eer");
            return (
              <div key={m.id} className="bg-ink p-6">
                <p className="label-xs">{m.name} · {m.modality}</p>
                <p className="mono mt-3 text-sm">v{m.version}</p>
                {auc || eer ? (
                  <dl className="mono mt-4 grid grid-cols-2 gap-2 text-sm">
                    {auc && <div><dt className="text-[10px] text-muted">AUC</dt><dd className="text-2xl">{auc}</dd></div>}
                    {eer && <div><dt className="text-[10px] text-muted">EER</dt><dd className="text-2xl">{eer}</dd></div>}
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-muted">{m.calibrated ? "No test metrics recorded" : "Pretrained weights — not evaluated on a local test split"}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
