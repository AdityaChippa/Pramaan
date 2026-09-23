"use client";
import { motion, useReducedMotion } from "framer-motion";
import { VERDICT_META } from "@/config/indicators";
import type { Thresholds, Verdict } from "@/types/case";
import { pct } from "@/lib/format";

const R = 110;
const CX = 130;
const CY = 130;

function point(p: number, r = R) {
  const a = Math.PI * (1 - p);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

function arc(p0: number, p1: number) {
  const a = point(p0);
  const b = point(p1);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

export function VerdictGauge({ probability, verdict, thresholds }: { probability: number | null; verdict: Verdict | null; thresholds: Thresholds | null }) {
  const reduce = useReducedMotion();
  const tl = thresholds?.t_low ?? 0.3;
  const th = thresholds?.t_high ?? 0.7;
  const p = probability ?? 0;
  const angle = -90 + 180 * p;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 260 150" className="w-full max-w-[340px]" role="img" aria-label={`Manipulation probability ${pct(probability)}`}>
        <path d={arc(0, tl)} stroke={VERDICT_META.authentic.color} strokeOpacity={0.55} strokeWidth={14} fill="none" />
        <path d={arc(tl, th)} stroke={VERDICT_META.inconclusive.color} strokeOpacity={0.55} strokeWidth={14} fill="none" />
        <path d={arc(th, 1)} stroke={VERDICT_META.manipulated.color} strokeOpacity={0.55} strokeWidth={14} fill="none" />
        {[tl, th].map((t) => {
          const a = point(t, R - 14);
          const b = point(t, R + 14);
          const l = point(t, R + 26);
          return (
            <g key={t}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#D7E2EA" strokeWidth={1.5} />
              <text x={l.x} y={l.y} fill="rgba(215,226,234,0.7)" fontSize={9} textAnchor="middle" fontFamily="var(--font-jetbrains)">{t.toFixed(2)}</text>
            </g>
          );
        })}
        {probability !== null && (
          <motion.g initial={{ rotate: reduce ? angle : -90 }} animate={{ rotate: angle }} transition={{ duration: reduce ? 0 : 1.4, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ originX: `${CX}px`, originY: `${CY}px` }}>
            <line x1={CX} y1={CY} x2={CX} y2={CY - R + 22} stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
          </motion.g>
        )}
        <circle cx={CX} cy={CY} r={6} fill="#FFFFFF" />
      </svg>
      <p className="mono -mt-2 text-4xl" style={{ color: verdict ? VERDICT_META[verdict].color : undefined }}>{pct(probability, 1)}</p>
      <p className="label-xs mt-1">probability of manipulation{thresholds && !thresholds.calibrated ? " · uncalibrated" : ""}</p>
    </div>
  );
}
