"use client";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export function Sparkline({ values, color = "#D7E2EA", height = 36, domain = [0, 1] }: { values: (number | null)[]; color?: string; height?: number; domain?: [number, number] }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={domain} />
          <Line dataKey="v" stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
