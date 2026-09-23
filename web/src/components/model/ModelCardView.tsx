import { ConfusionMatrix, type Confusion } from "@/components/charts/ConfusionMatrix";
import { ReliabilityChart, type ReliabilityBin } from "@/components/charts/ReliabilityChart";
import { GROUP_LABELS } from "@/config/indicators";
import type { IndicatorCatalogRow, ModelRegistryRow } from "@/types/database";
import { bytes, isoTime } from "@/lib/format";

type Metrics = {
  auc?: number; eer?: number; accuracy?: number; precision?: number; recall?: number; f1?: number; ece?: number;
  confusion?: Confusion; reliability?: ReliabilityBin[]; trained_at?: string; test_size?: number; notes?: string;
  per_combo?: Record<string, { auc?: number; eer?: number; n?: number }>;
};

function fmt(v: unknown, d = 3): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="bg-ink p-4"><p className="label-xs">{k}</p><p className="mono mt-1 text-2xl">{v}</p></div>;
}

export function ModelCardView({ models, catalog }: { models: ModelRegistryRow[]; catalog: IndicatorCatalogRow[] }) {
  const active = models.filter((m) => m.is_active);
  const history = models.filter((m) => !m.is_active);
  const fusion = active.find((m) => m.name === "fusion");
  const fm = (fusion?.metrics ?? {}) as Metrics;
  return (
    <div className="grid gap-12">
      {active.length === 0 && (
        <p className="panel p-8 text-lg">Not trained yet — no active model versions are registered. Run <code className="mono text-sm">backend/scripts/fetch_pretrained.py</code> or the training pipeline.</p>
      )}
      {active.length > 0 && !fusion?.calibrated && (
        <p className="rounded-2xl border border-inconclusive/40 bg-inconclusive/10 p-5 text-sm text-inconclusive">
          Uncalibrated defaults: fusion weights and indicator calibrators are documented defaults, not trained on a validation split. Verdicts are indicative only until the training pipeline publishes a calibrated fusion model.
        </p>
      )}

      {fusion && (fm.auc !== undefined || fm.eer !== undefined) && (
        <section className="grid gap-6">
          <h2 className="text-3xl font-semibold">Fused system — held-out test split</h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-4">
            <Stat k="AUC" v={fmt(fm.auc)} /><Stat k="EER" v={fmt(fm.eer)} /><Stat k="Accuracy" v={fmt(fm.accuracy)} /><Stat k="ECE" v={fmt(fm.ece)} />
            <Stat k="Precision" v={fmt(fm.precision)} /><Stat k="Recall" v={fmt(fm.recall)} /><Stat k="F1" v={fmt(fm.f1)} /><Stat k="Test items" v={fm.test_size !== undefined ? String(fm.test_size) : "—"} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {fm.confusion && <div className="panel p-5"><p className="label-xs mb-3">Confusion matrix at t_high</p><ConfusionMatrix c={fm.confusion} caption={fusion.thresholds ? `t_low ${fusion.thresholds.t_low.toFixed(3)} · t_high ${fusion.thresholds.t_high.toFixed(3)} · target FPR ${fusion.thresholds.target_fpr}` : undefined} /></div>}
            {fm.reliability && <div className="panel p-5"><p className="label-xs mb-3">Reliability diagram</p><ReliabilityChart bins={fm.reliability} /></div>}
          </div>
          {fm.per_combo && (
            <table className="mono w-full text-sm">
              <thead className="label-xs text-left"><tr className="border-b border-hairline"><th className="py-2">Modality combo</th><th>AUC</th><th>EER</th><th>n</th></tr></thead>
              <tbody>{Object.entries(fm.per_combo).map(([k, v]) => <tr key={k} className="border-b border-hairline"><td className="py-2">{k}</td><td>{fmt(v.auc)}</td><td>{fmt(v.eer)}</td><td>{v.n ?? "—"}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}

      {active.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-3xl font-semibold">Active models</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((m) => {
              const met = (m.metrics ?? {}) as Metrics;
              const ds = m.dataset_stats ?? {};
              return (
                <article key={m.id} className="panel grid gap-3 p-5">
                  <div className="flex items-baseline justify-between"><h3 className="text-xl font-medium">{m.name}</h3><span className="mono text-xs text-muted">v{m.version}</span></div>
                  <p className="text-xs text-muted">{m.modality} · {m.format} · {bytes(m.size_bytes)} · registered {isoTime(m.created_at).slice(0, 10)}{met.trained_at ? ` · trained ${met.trained_at.slice(0, 10)}` : ""}</p>
                  <dl className="mono grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-[10px] text-muted">AUC</dt><dd>{fmt(met.auc)}</dd></div>
                    <div><dt className="text-[10px] text-muted">EER</dt><dd>{fmt(met.eer)}</dd></div>
                    <div><dt className="text-[10px] text-muted">Accuracy</dt><dd>{fmt(met.accuracy)}</dd></div>
                  </dl>
                  {met.auc === undefined && <p className="text-xs text-muted">No local test metrics recorded for this version{m.version.includes("pretrained") ? " (published pretrained weights)" : ""}.</p>}
                  {met.notes && <p className="text-xs text-muted">{met.notes}</p>}
                  {Object.keys(ds).length > 0 && <pre className="mono max-h-40 overflow-auto rounded-lg border border-hairline p-2 text-[11px] text-muted">{JSON.stringify(ds, null, 2)}</pre>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-2xl font-semibold">Version history</h2>
          <table className="mono w-full text-xs">
            <thead className="label-xs text-left"><tr className="border-b border-hairline"><th className="py-2">name</th><th>version</th><th>AUC</th><th>EER</th><th>calibrated</th><th>registered</th></tr></thead>
            <tbody>{history.map((m) => {
              const met = (m.metrics ?? {}) as Metrics;
              return <tr key={m.id} className="border-b border-hairline"><td className="py-2">{m.name}</td><td>{m.version}</td><td>{fmt(met.auc)}</td><td>{fmt(met.eer)}</td><td>{String(m.calibrated)}</td><td>{isoTime(m.created_at).slice(0, 16)}</td></tr>;
            })}</tbody>
          </table>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold">Indicator catalog</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="label-xs text-left"><tr className="border-b border-hairline"><th className="py-2">Indicator</th><th>Group</th><th>Method</th><th>Expected (authentic)</th><th>Reference</th></tr></thead>
            <tbody>{catalog.map((c) => (
              <tr key={c.id} className="border-b border-hairline align-top">
                <td className="py-2 pr-3">{c.name}</td>
                <td className="pr-3 text-xs text-muted">{GROUP_LABELS[c.group as keyof typeof GROUP_LABELS] ?? c.group}</td>
                <td className="pr-3 text-xs">{c.method}</td>
                <td className="mono pr-3 text-xs">{c.expected_range}</td>
                <td className="text-xs text-muted">{c.reference}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-2 text-sm text-muted">
        <h2 className="text-2xl font-semibold text-fog">Intended use & limitations</h2>
        <p>Decision support for trained investigators. Scores are probabilistic; unseen generators, heavy compression, very short clips and non-frontal faces reduce reliability. Indicators that could not be measured are excluded from fusion rather than imputed. Human review is required before any consequential decision.</p>
      </section>
    </div>
  );
}
