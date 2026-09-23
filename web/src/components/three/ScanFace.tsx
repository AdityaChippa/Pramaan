"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MeshJson { count: number; vertices: [number, number, number][] }

const vertex = /* glsl */ `
  uniform float uScanY;
  uniform float uTime;
  attribute float aLit;
  varying float vGlow;
  void main() {
    float d = abs(position.y - uScanY);
    float band = smoothstep(0.9, 0.0, d);
    float trail = clamp(1.0 - (uScanY - position.y) * 0.18, 0.0, 1.0) * step(position.y, uScanY) * 0.35;
    vGlow = max(band, trail) + aLit * 0.0;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (2.2 + band * 3.2) * (18.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const fragment = /* glsl */ `
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 base = vec3(0.39, 0.41, 0.45);
    vec3 hot = mix(vec3(0.71, 0.0, 0.66), vec3(1.0), vGlow * 0.6);
    gl_FragColor = vec4(mix(base, hot, vGlow), 0.55 + vGlow * 0.45);
  }
`;

function FacePoints({ data, reduced }: { data: MeshJson; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Mesh>(null);
  const { geometry, minY, maxY } = useMemo(() => {
    const pos = new Float32Array(data.vertices.flat());
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(data.count), 1));
    g.computeBoundingBox();
    g.center();
    const bb = g.boundingBox!;
    return { geometry: g, minY: bb.min.y, maxY: bb.max.y };
  }, [data]);
  const uniforms = useMemo(() => ({ uScanY: { value: reduced ? (minY + maxY) / 2 : minY }, uTime: { value: 0 } }), [minY, maxY, reduced]);

  useFrame((state, dt) => {
    if (reduced) return;
    const span = maxY - minY + 4;
    const t = (state.clock.elapsedTime * 0.28) % 1;
    uniforms.uScanY.value = maxY + 2 - t * span;
    uniforms.uTime.value += dt;
    if (plane.current) plane.current.position.y = uniforms.uScanY.value;
    if (group.current) {
      const px = state.pointer.x * 0.35;
      const py = -state.pointer.y * 0.18;
      group.current.rotation.y += (px + Math.sin(state.clock.elapsedTime * 0.25) * 0.25 - group.current.rotation.y) * 0.05;
      group.current.rotation.x += (py - group.current.rotation.x) * 0.05;
    }
  });

  return (
    <group ref={group}>
      <points geometry={geometry}>
        <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} />
      </points>
      <mesh ref={plane} rotation={[-Math.PI / 2, 0, 0]} position={[0, uniforms.uScanY.value, 0]}>
        <planeGeometry args={[16, 12]} />
        <meshBasicMaterial color="#B600A8" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Point-cloud face from MediaPipe's canonical face mesh with a sweeping forensic scan plane. */
export function ScanFace({ className }: { className?: string }) {
  const [data, setData] = useState<MeshJson | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    let alive = true;
    fetch("/canonical-face-mesh.json").then((r) => r.json()).then((j: MeshJson) => alive && setData(j)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return (
    <div className={className} aria-label="Point-cloud face being scanned" role="img">
      {data && (
        <Canvas camera={{ position: [0, 0, 22], fov: 38 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} frameloop={reduced ? "demand" : "always"}>
          <FacePoints data={data} reduced={reduced} />
        </Canvas>
      )}
    </div>
  );
}
