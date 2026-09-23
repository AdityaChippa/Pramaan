"use client";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

const AXIS = { stroke: "rgba(215,226,234,0.35)", fontSize: 11, fontFamily: "var(--font-jetbrains)" };

export function SeriesChart({
  data, xKey, series, height = 220, yDomain, refLines = [], refAreas = [], xLabel, onPointClick,
}: {
  data: Record<string, number | null>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  yDomain?: [number | "auto", number | "auto"];
  refLines?: { y?: number; x?: number; label: string; color?: string }[];
  refAreas?: { x1: number; x2: number }[];
  xLabel?: string;
  onPointClick?: (x: number) => void;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: xLabel ? 18 : 4, left: 0 }}
          onClick={(e) => {
            const v = e?.activeLabel;
            if (onPointClick && v !== undefined) onPointClick(Number(v));
          }}
        >
          <CartesianGrid stroke="rgba(215,226,234,0.08)" vertical={false} />
          <XAxis dataKey={xKey} type="number" domain={["dataMin", "dataMax"]} tick={AXIS} stroke={AXIS.stroke}
            label={xLabel ? { value: xLabel, position: "insideBottom", offset: -8, fill: AXIS.stroke, fontSize: 11 } : undefined} />
          <YAxis domain={yDomain ?? ["auto", "auto"]} tick={AXIS} stroke={AXIS.stroke} width={44} />
          <Tooltip
            contentStyle={{ background: "#121212", border: "1px solid rgba(215,226,234,0.12)", borderRadius: 12, fontFamily: "var(--font-jetbrains)", fontSize: 12 }}
            labelStyle={{ color: "#D7E2EA" }}
          />
          {refAreas.map((a, i) => <ReferenceArea key={i} x1={a.x1} x2={a.x2} fill="#B600A8" fillOpacity={0.15} />)}
          {refLines.map((r, i) => (
            <ReferenceLine key={i} y={r.y} x={r.x} stroke={r.color ?? "rgba(215,226,234,0.4)"} strokeDasharray="4 4"
              label={{ value: r.label, fill: r.color ?? "rgba(215,226,234,0.6)", fontSize: 10, position: "insideTopRight" }} />
          ))}
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} dot={false} strokeWidth={1.75} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
