"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { buildAtlas, type AtlasCard } from "./cardAtlas";

const RADIUS = 14;
const CARD = 2.1;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const LAT_MIN = -0.95; // radians; cards stay away from the poles where "upright" degenerates
const LAT_MAX = 1.05;

const vertex = /* glsl */ `
  attribute vec2 aCell;
  attribute float aHover;
  uniform float uGrid;
  varying vec2 vUv;
  varying float vHover;
  void main() {
    vUv = vec2((uv.x + aCell.x) / uGrid, 1.0 - ((1.0 - uv.y) + aCell.y) / uGrid);
    vHover = aHover;
    vec3 p = position * (1.0 + aHover * 0.14);
    p.z += aHover * 0.6;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vHover;
  void main() {
    vec4 c = texture2D(uAtlas, vUv);
    gl_FragColor = vec4(c.rgb * (0.78 + vHover * 0.35), 1.0);
    #include <colorspace_fragment>
  }
`;

export type DomeMode = "sphere" | "cluster";

/** Fibonacci distribution over a latitude band of the inner sphere surface. */
function fibonacciBand(n: number, latMin: number, latMax: number, phase = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const sMin = Math.sin(latMin);
  const sMax = Math.sin(latMax);
  for (let i = 0; i < n; i++) {
    const s = sMin + ((i + 0.5) / Math.max(n, 1)) * (sMax - sMin);
    const lat = Math.asin(s);
    const az = i * GOLDEN + phase;
    out.push(new THREE.Vector3(RADIUS * Math.cos(lat) * Math.sin(az), RADIUS * s, -RADIUS * Math.cos(lat) * Math.cos(az)));
  }
  return out;
}

function layout(cards: AtlasCard[], mode: DomeMode): THREE.Vector3[] {
  if (mode === "sphere") return fibonacciBand(cards.length, LAT_MIN, LAT_MAX);
  const bands: Record<string, [number, number]> = { manipulated: [0.45, 1.05], inconclusive: [-0.2, 0.35], other: [-0.95, -0.3] };
  const groups: Record<string, number[]> = { manipulated: [], inconclusive: [], other: [] };
  cards.forEach((c, i) => (c.verdict === "manipulated" ? groups.manipulated : c.verdict === "inconclusive" ? groups.inconclusive : groups.other).push(i));
  const out: THREE.Vector3[] = new Array(cards.length);
  Object.entries(groups).forEach(([k, idx], g) => {
    const pts = fibonacciBand(idx.length, bands[k][0], bands[k][1], g * 1.3);
    idx.forEach((ci, j) => (out[ci] = pts[j]));
  });
  return out;
}

function hashPoints(seeds: string[], count = 1200): Float32Array {
  const arr = new Float32Array(count * 3);
  const hex = seeds.join("").replace(/[^0-9a-f]/gi, "") || "0123456789abcdef";
  for (let i = 0; i < count; i++) {
    const a = parseInt(hex.substr((i * 7) % Math.max(1, hex.length - 8), 8).padEnd(8, "0"), 16) / 0xffffffff;
    const b = parseInt(hex.substr((i * 13 + 3) % Math.max(1, hex.length - 8), 8).padEnd(8, "0"), 16) / 0xffffffff;
    const u = ((a + i * 0.618034) % 1) * 2 - 1;
    const th = ((b + i * 0.381966) % 1) * Math.PI * 2;
    const r = 34 + ((a * 9973) % 1) * 10;
    const q = Math.sqrt(1 - u * u);
    arr.set([r * q * Math.cos(th), r * u, r * q * Math.sin(th)], i * 3);
  }
  return arr;
}

interface Look { yaw: number; pitch: number; fov: number; fly: { yaw: number; pitch: number; fov: number } | null }

function Cards({ cards, mode, onSelect, look, reduced }: { cards: AtlasCard[]; mode: DomeMode; onSelect: (id: string) => void; look: React.MutableRefObject<Look>; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { atlas, geometry } = useMemo(() => {
    const atlas = buildAtlas(cards);
    const geometry = new THREE.PlaneGeometry(CARD, CARD);
    const cell = new Float32Array(cards.length * 2);
    cards.forEach((_, i) => { cell[i * 2] = i % atlas.grid; cell[i * 2 + 1] = Math.floor(i / atlas.grid); });
    geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
    geometry.setAttribute("aHover", new THREE.InstancedBufferAttribute(new Float32Array(cards.length), 1));
    return { atlas, geometry };
  }, [cards]);
  const uniforms = useMemo(() => ({ uAtlas: { value: atlas.texture }, uGrid: { value: atlas.grid } }), [atlas]);
  useEffect(() => () => { atlas.dispose(); geometry.dispose(); }, [atlas, geometry]);

  const targets = useMemo(() => layout(cards, mode), [cards, mode]);
  const current = useRef<THREE.Vector3[]>([]);
  const dirty = useRef(true);
  useEffect(() => {
    // New cards start at the centre of the view and re-flow outward; existing ones animate to new slots.
    const prev = current.current;
    current.current = targets.map((t, i) => (prev[i] ? prev[i].clone() : reduced ? t.clone() : t.clone().multiplyScalar(0.2)));
    dirty.current = true;
  }, [targets, reduced]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    let moving = false;
    current.current.forEach((p, i) => {
      const t = targets[i];
      if (!t) return;
      if (p.distanceToSquared(t) > 1e-4) {
        p.lerp(t, reduced ? 1 : 0.08);
        moving = true;
      }
    });
    if (moving || dirty.current) {
      current.current.forEach((p, i) => {
        dummy.position.copy(p);
        dummy.up.copy(up);
        // Per-frame world-up lookAt toward the dome axis at the card's height keeps text upright (never rolls or mirrors).
        dummy.lookAt(0, p.y, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      dirty.current = false;
    }
    const attr = geometry.getAttribute("aHover") as THREE.InstancedBufferAttribute;
    let changed = false;
    for (let i = 0; i < attr.count; i++) {
      const target = i === hover ? 1 : 0;
      const v = attr.getX(i);
      if (Math.abs(v - target) > 0.001) { attr.setX(i, v + (target - v) * 0.2); changed = true; }
    }
    if (changed) attr.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, cards.length]}
      frustumCulled={false}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(e.instanceId ?? null); }}
      onPointerOut={() => setHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.instanceId === undefined || e.delta > 6) return;
        const p = targets[e.instanceId];
        // Camera looks along -Z at yaw 0; yaw rotates about +Y, so a point (x,z) sits at yaw atan2(-x, -z).
        look.current.fly = { yaw: Math.atan2(-p.x, -p.z), pitch: Math.asin(THREE.MathUtils.clamp(p.y / RADIUS, -1, 1)), fov: 42 };
        onSelect(cards[e.instanceId].id);
      }}
    >
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function Starfield({ seeds }: { seeds: string[] }) {
  const positions = useMemo(() => hashPoints(seeds), [seeds]);
  return (
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#8f9aa3" size={0.08} sizeAttenuation transparent opacity={0.55} fog />
    </points>
  );
}

function LookControls({ look, reduced }: { look: React.MutableRefObject<Look>; reduced: boolean }) {
  const { camera, gl } = useThree();
  const drag = useRef({ active: false, lx: 0, ly: 0, vy: 0, vp: 0, pinch: 0 });
  useEffect(() => {
    const el = gl.domElement;
    const d = drag.current;
    const pointers = new Map<number, { x: number; y: number }>();
    const down = (e: PointerEvent) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); d.active = true; d.lx = e.clientX; d.ly = e.clientY; look.current.fly = null; };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (d.pinch) look.current.fov = THREE.MathUtils.clamp(look.current.fov - (dist - d.pinch) * 0.08, 35, 85);
        d.pinch = dist;
        return;
      }
      d.vy = (e.clientX - d.lx) * 0.0035;
      d.vp = (e.clientY - d.ly) * 0.0025;
      look.current.yaw += d.vy;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + d.vp, -1.0, 1.1);
      d.lx = e.clientX; d.ly = e.clientY;
    };
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); d.pinch = 0; if (!pointers.size) d.active = false; };
    const wheel = (e: WheelEvent) => { look.current.fly = null; look.current.fov = THREE.MathUtils.clamp(look.current.fov + e.deltaY * 0.02, 35, 85); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, look]);

  useFrame((_, dt) => {
    const L = look.current;
    const d = drag.current;
    if (L.fly) {
      let dy = L.fly.yaw - L.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = reduced ? 1 : 0.07;
      L.yaw += dy * k;
      L.pitch += (L.fly.pitch - L.pitch) * k;
      L.fov += (L.fly.fov - L.fov) * k;
      if (Math.abs(dy) < 1e-3 && Math.abs(L.fly.pitch - L.pitch) < 1e-3) L.fly = null;
    } else if (!d.active) {
      L.yaw += d.vy;
      d.vy *= 0.94;
      d.vp *= 0.94;
      if (!reduced && Math.abs(d.vy) < 0.0004) L.yaw += dt * 0.015;
    }
    const cam = camera as THREE.PerspectiveCamera;
    cam.rotation.order = "YXZ";
    cam.rotation.set(L.pitch, L.yaw, 0);
    if (Math.abs(cam.fov - L.fov) > 1e-3) { cam.fov = L.fov; cam.updateProjectionMatrix(); }
  });
  return null;
}

export function DomeScene({ cards, mode, onSelect, className }: { cards: AtlasCard[]; mode: DomeMode; onSelect: (id: string) => void; className?: string }) {
  const reduced = useReducedMotion();
  const look = useRef<Look>({ yaw: 0, pitch: 0.1, fov: 68, fly: null });
  const seeds = useMemo(() => cards.map((c) => c.seed), [cards]);
  return (
    <div className={className} style={{ touchAction: "none", cursor: "grab" }}>
      <Canvas camera={{ position: [0, 0, 0.01], fov: 68, near: 0.1, far: 120 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
        <color attach="background" args={["#0C0C0C"]} />
        <fog attach="fog" args={["#0C0C0C", 20, 48]} />
        <Starfield seeds={seeds} />
        {cards.length > 0 && <Cards cards={cards} mode={mode} onSelect={onSelect} look={look} reduced={reduced} />}
        <LookControls look={look} reduced={reduced} />
      </Canvas>
    </div>
  );
}
