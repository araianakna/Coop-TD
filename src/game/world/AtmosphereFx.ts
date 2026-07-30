import * as THREE from "three";
import type { Grid } from "@/game/grid/Grid";

/**
 * Cheap floating light-mote / dust particle system for atmospheric depth.
 * A single THREE.Points draw call; all drift/sway/looping motion happens in
 * the vertex shader driven by one `uTime` uniform, so per-frame JS cost is a
 * single number assignment (via `points.userData.tick`).
 */

export interface AtmosphereOptions {
  count?: number;
  heightMin?: number;
  heightRange?: number;
  color?: THREE.ColorRepresentation;
}

export function createAtmosphereFx(grid: Grid, options: AtmosphereOptions = {}): THREE.Points {
  const count = options.count ?? 150;
  const heightMin = options.heightMin ?? 0.4;
  const heightRange = options.heightRange ?? 6.5;
  const color = new THREE.Color(options.color ?? 0xffd9a0);

  const halfW = (grid.width * grid.cellSize) / 2 + 3;
  const halfD = (grid.height * grid.cellSize) / 2 + 3;

  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const sway = new Float32Array(count);
  const size = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    base[i * 3 + 0] = (Math.random() * 2 - 1) * halfW;
    base[i * 3 + 1] = Math.random() * heightRange;
    base[i * 3 + 2] = (Math.random() * 2 - 1) * halfD;
    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = 0.12 + Math.random() * 0.3;
    sway[i] = 0.25 + Math.random() * 0.85;
    size[i] = 5 + Math.random() * 8;
  }

  const geometry = new THREE.BufferGeometry();
  // "position" is required for a valid draw call / bounding sphere; the
  // vertex shader below drives actual motion from aBase instead.
  geometry.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
  geometry.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uHeightMin: { value: heightMin },
      uHeightRange: { value: heightRange },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aBase;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aSway;
      attribute float aSize;
      uniform float uTime;
      uniform float uHeightMin;
      uniform float uHeightRange;
      varying float vAlpha;

      void main() {
        float cycle = fract((aBase.y / max(uHeightRange, 0.001)) + uTime * aSpeed * 0.05);
        float y = uHeightMin + cycle * uHeightRange;
        float swayX = sin(uTime * 0.35 + aPhase) * aSway;
        float swayZ = cos(uTime * 0.27 + aPhase * 1.4) * aSway;
        vec3 p = vec3(aBase.x + swayX, y, aBase.z + swayZ);

        vAlpha = smoothstep(0.0, 0.12, cycle) * smoothstep(1.0, 0.82, cycle);

        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (70.0 / max(0.001, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float mask = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, mask * vAlpha * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.tick = (_dt: number, elapsed: number) => {
    material.uniforms.uTime.value = elapsed;
  };
  return points;
}
