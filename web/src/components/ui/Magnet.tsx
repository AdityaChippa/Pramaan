"use client";
import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MagnetProps {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}

/** Spec Magnet: element drifts toward the pointer with a spring and snaps back on leave. */
export function Magnet({ children, strength = 0.25, className }: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 150, damping: 15, mass: 0.2 });
  const y = useSpring(my, { stiffness: 150, damping: 15, mass: 0.2 });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced || e.pointerType === "touch" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function onLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.div ref={ref} className={className} style={reduced ? undefined : { x, y }} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </motion.div>
  );
}
