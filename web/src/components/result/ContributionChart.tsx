"use client";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GROUP_LABELS, GROUP_ORDER } from "@/config/indicators";
import type { Indicator, ModalityContributions } from "@/types/case";
import { num } from "@/lib/format";

export function ContributionChart({ contributions, indicators }: { contributions: ModalityContributions; indicators: Indicator[] }) {
  const names = new Map(indicators.map((i) => [i.id, i.name]));
  const data = GROUP_ORDER.map((g) => ({ group: GROUP_LABELS[g], sum: contributions.groups[g].sum, pct: contributions.groups[g].pct, dir: contributions.groups[g].direction }));
  const rows = contributions.per_indicator.filter((r) => r.mask === 1).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <XAxis type="number" tick={{ fill: "rgba(215,226,234,0.5)", fontSize: 11 }} stroke="rgba(215,226,234,0.2)" />
              <YAxis type="category" dataKey="group" width={150} tick={{ fill: "#D7E2EA", fontSize: 12 }} stroke="rgba(215,226,234,0.2)" />
              <ReferenceLine x={0} stroke="rgba(215,226,234,0.4)" />
              <Tooltip cursor={{ fill: "rgba(215,226,234,0.04)" }}
                contentStyle={{ background: "#121212", border: "1px solid rgba(215,226,234,0.12)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: number, _n, item) => [`${num(v, 3)} log-odds · ${num((item.payload as { pct: number }).pct, 1)}%`, "contribution"]} />
              <Bar dataKey="sum" isAnimationActive>
                {data.map((d) => <Cell key={d.group} fill={d.sum > 0 ? "#FF4D5E" : d.sum < 0 ? "#3DDC97" : "#555"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mono mt-3 text-xs text-muted">
          logit = intercept {num(contributions.intercept, 3)} + Σ contributions = {num(contributions.logit, 3)} · combo {contributions.combo}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {data.map((d) => (
            <li key={d.group} className="flex justify-between rounded-lg border border-hairline px-3 py-2">
              <span>{d.group}</span>
              <span className="mono" style={{ color: d.dir === "fake" ? "#FF4D5E" : d.dir === "real" ? "#3DDC97" : undefined }}>
                {num(d.pct, 1)}% {d.dir === "fake" ? "→ fake" : d.dir === "real" ? "→ real" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="label-xs sticky top-0 bg-panel text-left">
            <tr><th className="py-2">Indicator</th><th className="text-right">logit(score)</th><th className="text-right">weight</th><th className="text-right">contribution</th></tr>
          </thead>
          <tbody className="mono">
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hairline">
                <td className="py-1.5 font-sans">{names.get(r.id) ?? r.id}</td>
                <td className="text-right">{num(r.x, 3)}</td>
                <td className="text-right">{num(r.weight, 3)}</td>
                <td className="text-right" style={{ color: r.contribution > 0 ? "#FF4D5E" : r.contribution < 0 ? "#3DDC97" : undefined }}>{num(r.contribution, 3)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="py-3 text-muted">No indicator contributed.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
