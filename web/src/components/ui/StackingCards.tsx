"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Spec StackingCards: sticky cards that pile up and scale back as the next card arrives. */
export function StackingCards({ items }: { items: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <div ref={ref} className="relative">
      {items.map((item, i) => (
        <StackCard key={i} index={i} total={items.length} progress={scrollYProgress}>
          {item}
        </StackCard>
      ))}
    </div>
  );
}

function StackCard({ children, index, total, progress }: { children: React.ReactNode; index: number; total: number; progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const targetScale = 1 - (total - index) * 0.04;
  const scale = useTransform(progress, [index / total, 1], [1, targetScale]);
  return (
    <div className="sticky flex h-[92vh] items-start justify-center" style={{ top: `calc(8vh + ${index * 28}px)` }}>
      <motion.div className="w-full origin-top" style={reduced ? undefined : { scale }}>
        {children}
      </motion.div>
    </div>
  );
}
