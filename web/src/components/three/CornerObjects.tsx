"use client";
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type CornerKind = "frame" | "waveform" | "filmstrip" | "tag";

const HAIR = "#D7E2EA";
const ACCENT = "#B600A8";

function ImageFrame() {
  return (
    <group>
      <mesh><boxGeometry args={[2.6, 2, 0.08]} /><meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.6} /></mesh>
      <mesh position={[0, 0, 0.05]}><planeGeometry args={[2.3, 1.7]} /><meshStandardMaterial color="#2a2d33" /></mesh>
      <mesh position={[-0.4, -0.2, 0.06]}><circleGeometry args={[0.35, 32]} /><meshBasicMaterial color={ACCENT} /></mesh>
      <lineSegments position={[0.3, 0.25, 0.07]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.9, 0.7)]} />
        <lineBasicMaterial color={HAIR} />
      </lineSegments>
    </group>
  );
}

function Waveform() {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(3.2, 0.8, 96, 1), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const env = Math.exp(-x * x * 0.35);
      pos.setY(i, base[i * 3 + 1] * (0.4 + env * Math.abs(Math.sin(x * 5 + t * 2.2))) + Math.sin(x * 2 + t) * 0.15);
      pos.setZ(i, Math.cos(x * 1.4 + t * 0.8) * 0.3);
    }
    pos.needsUpdate = true;
  });
  return <mesh ref={ref} geometry={geo}><meshStandardMaterial color={ACCENT} side={THREE.DoubleSide} emissive={ACCENT} emissiveIntensity={0.4} /></mesh>;
}

function FilmStrip() {
  return (
    <group rotation={[0, 0, 0.12]}>
      <mesh><boxGeometry args={[3.4, 1.2, 0.05]} /><meshStandardMaterial color="#151515" /></mesh>
      {[-1.1, 0, 1.1].map((x) => (
        <mesh key={x} position={[x, 0, 0.04]}><planeGeometry args={[0.9, 0.7]} /><meshStandardMaterial color={x === 0 ? ACCENT : "#2f3238"} /></mesh>
      ))}
      {Array.from({ length: 10 }, (_, i) => -1.55 + i * 0.345).flatMap((x) => [0.5, -0.5].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0.04]}><planeGeometry args={[0.12, 0.1]} /><meshBasicMaterial color={HAIR} /></mesh>
      )))}
    </group>
  );
}

function MetaTag() {
  return (
    <group>
      <mesh><boxGeometry args={[2.2, 1.2, 0.06]} /><meshStandardMaterial color="#1c1c1c" metalness={0.4} roughness={0.5} /></mesh>
      <mesh position={[-0.85, 0, 0.05]}><circleGeometry args={[0.13, 24]} /><meshBasicMaterial color="#0C0C0C" /></mesh>
      {[0.3, 0.05, -0.2].map((y, i) => (
        <mesh key={y} position={[0.15 - i * 0.1, y, 0.05]}><planeGeometry args={[1.1 - i * 0.2, 0.08]} /><meshBasicMaterial color={i === 0 ? ACCENT : HAIR} /></mesh>
      ))}
    </group>
  );
}

function Spinner({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock, pointer }) => {
    if (reduced || !g.current) return;
    g.current.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.5 + pointer.x * 0.3;
    g.current.rotation.x = Math.cos(clock.elapsedTime * 0.5) * 0.2 - pointer.y * 0.2;
  });
  return <group ref={g}>{children}</group>;
}

/** Small R3F objects placed in the four corners of the How-it-works section. */
export function CornerObject({ kind, className }: { kind: CornerKind; className?: string }) {
  const reduced = useReducedMotion();
  const Obj = { frame: ImageFrame, waveform: Waveform, filmstrip: FilmStrip, tag: MetaTag }[kind];
  return (
    <div className={className} aria-hidden>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.5]} gl={{ alpha: true }} frameloop={reduced ? "demand" : "always"}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={1.2} />
        <Spinner reduced={reduced}><Obj /></Spinner>
      </Canvas>
    </div>
  );
}
