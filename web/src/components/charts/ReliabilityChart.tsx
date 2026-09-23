"use client";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

export interface ReliabilityBin { bin_lo: number; bin_hi: number; mean_pred: number | null; frac_pos: number | null; count: number }

export function ReliabilityChart({ bins }: { bins: ReliabilityBin[] }) {
  const data = bins.filter((b) => b.count > 0 && b.mean_pred !== null).map((b) => ({ x: b.mean_pred, y: b.frac_pos, n: b.count }));
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="rgba(215,226,234,0.08)" />
          <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fill: "rgba(215,226,234,0.5)", fontSize: 11 }} label={{ value: "mean predicted p", position: "insideBottom", offset: -8, fill: "rgba(215,226,234,0.5)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 1]} tick={{ fill: "rgba(215,226,234,0.5)", fontSize: 11 }} width={40} />
          <Tooltip contentStyle={{ background: "#121212", border: "1px solid rgba(215,226,234,0.12)", borderRadius: 12, fontSize: 12 }} />
          <Line data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" stroke="rgba(215,226,234,0.35)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line data={data} dataKey="y" stroke="#B600A8" strokeWidth={2} isAnimationActive={false} />
          <Scatter data={data} fill="#D7E2EA" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
