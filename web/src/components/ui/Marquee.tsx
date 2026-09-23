"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Spec Marquee: two rows translated horizontally in opposite directions, driven by page scroll. */
export function Marquee({ rows }: { rows: [React.ReactNode[], React.ReactNode[]] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x1 = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);
  const x2 = useTransform(scrollYProgress, [0, 1], ["-30%", "0%"]);
  return (
    <div ref={ref} className="flex flex-col gap-5 overflow-hidden py-6">
      {rows.map((row, i) => (
        <motion.div key={i} className="flex w-max gap-5" style={reduced ? undefined : { x: i === 0 ? x1 : x2 }}>
          {row}
          {row}
        </motion.div>
      ))}
    </div>
  );
}
