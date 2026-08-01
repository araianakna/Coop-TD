import * as THREE from "three";
import type { Element } from "@/game/types";
import { NOISE_GLSL } from "./noise";

/**
 * Per-element palette. `coreA`/`coreB` are the two colors the animated core
 * shader interpolates between (dim -> hot), `rim` is the fresnel rim-light
 * kick, `structure`/`structureDark` tint the lit (MeshStandardMaterial)
 * pedestal/frame parts so the whole tower reads as one object family.
 */
export const ELEMENT_PALETTE: Record<
  Element,
  { coreA: number; coreB: number; rim: number; structure: number; structureDark: number }
> = {
  fire: { coreA: 0xb0140a, coreB: 0xffb23c, rim: 0xffe29a, structure: 0x3a2320, structureDark: 0x1c1210 },
  ice: { coreA: 0x1c6fbf, coreB: 0x8fe3ff, rim: 0xbdf3ff, structure: 0x25313e, structureDark: 0x121a20 },
  lightning: { coreA: 0x4d2ed6, coreB: 0xb488ff, rim: 0xc7f5ff, structure: 0x2a2440, structureDark: 0x14101f },
  nature: { coreA: 0x0f6b2c, coreB: 0x8fe04a, rim: 0xd8ff9a, structure: 0x2c2416, structureDark: 0x16110a },
  earth: { coreA: 0x8a4a12, coreB: 0xffcf5c, rim: 0xffe6a8, structure: 0x3d332a, structureDark: 0x1e1912 },
  arcane: { coreA: 0x7d1fa3, coreB: 0xdd6dff, rim: 0x9ef9ff, structure: 0x2a1c3a, structureDark: 0x140d1c },
  shadow: { coreA: 0x2e1c4a, coreB: 0x9c7fe0, rim: 0xc8f0ff, structure: 0x1c1626, structureDark: 0x0d0a12 },
};

/**
 * Pattern ids consumed by the core fragment shader. Fusion towers pick two
 * different single-element materials for different mesh parts rather than
 * blending patterns inside one shader — keeps each part's silhouette/motif
 * legible instead of muddying into a blur.
 */
const PATTERN_ID: Record<Element, number> = {
  fire: 0,
  ice: 1,
  lightning: 2,
  nature: 3,
  earth: 4,
  arcane: 5,
  shadow: 5,
};

const CORE_VERTEX = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vLocalPos = position;
    vNormalW = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uRimColor;
  uniform float uIntensity;
  uniform float uScale;
  uniform int uPattern;

  varying vec3 vLocalPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${NOISE_GLSL}

  float patternFire(vec3 p, float t) {
    vec3 q = p * uScale;
    q.y -= t * 1.7;
    float n = twFbm(q);
    return smoothstep(0.28, 0.85, n);
  }

  float patternIce(vec3 p, float t) {
    vec3 q = p * uScale * 1.35;
    float n = twFbm(q + vec3(0.0, t * 0.04, 0.0));
    float facets = floor(n * 6.0) / 6.0;
    float sparkle = step(0.972, fract(sin(dot(floor(q * 10.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453));
    return clamp(facets * 0.75 + sparkle * 1.6, 0.0, 1.2);
  }

  float patternLightning(vec3 p, float t) {
    vec3 q = p * uScale;
    float n = twFbm(q + vec3(t * 2.6, -t * 3.4, t * 1.9));
    float arc = 1.0 - smoothstep(0.0, 0.05, abs(n - 0.5));
    float flicker = 0.65 + 0.35 * sin(t * 42.0 + p.y * 9.0);
    return clamp(arc * flicker * 1.4, 0.0, 1.3);
  }

  float patternNature(vec3 p, float t) {
    vec3 q = p * uScale;
    float veins = twFbm(q);
    float pulse = 0.5 + 0.5 * sin(t * 2.1 + p.y * 3.2 + veins * 4.0);
    return smoothstep(0.05, 0.55, veins) * (0.6 + pulse * 0.55);
  }

  float patternEarth(vec3 p, float t) {
    vec3 q = p * uScale;
    float n = twFbm(q);
    float cracks = 1.0 - smoothstep(0.0, 0.045, abs(n - 0.5));
    float glow = 0.55 + 0.45 * sin(t * 1.1 + n * 6.0);
    return clamp(cracks * glow * 1.3, 0.0, 1.2);
  }

  float patternArcane(vec3 p, float t) {
    float ang = atan(p.x, p.z);
    float rings = sin(length(p.xz) * uScale * 5.0 - t * 1.6);
    float segments = sin(ang * 8.0 + t * 0.7);
    float glyph = smoothstep(0.55, 1.0, rings) + smoothstep(0.8, 1.0, segments) * 0.6;
    return clamp(glyph, 0.0, 1.3);
  }

  void main() {
    float t = uTime;
    float v;
    if (uPattern == 0) v = patternFire(vLocalPos, t);
    else if (uPattern == 1) v = patternIce(vLocalPos, t);
    else if (uPattern == 2) v = patternLightning(vLocalPos, t);
    else if (uPattern == 3) v = patternNature(vLocalPos, t);
    else if (uPattern == 4) v = patternEarth(vLocalPos, t);
    else v = patternArcane(vLocalPos, t);

    vec3 base = mix(uColorA, uColorB, clamp(v, 0.0, 1.0));
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormalW), vViewDir), 0.0, 1.0), 2.0);
    vec3 color = base * (0.3 + v * uIntensity) + uRimColor * fresnel * uIntensity * 0.35;
    float alpha = clamp(0.4 + v * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

/** All live core materials, so a single per-frame call can advance uTime on every tower at once. */
const liveCoreMaterials = new Set<THREE.ShaderMaterial>();

export interface CoreMaterialOptions {
  /** Noise/pattern frequency. Larger meshes usually want a smaller scale. */
  scale?: number;
  /** Override the tier-driven bloom intensity. */
  intensity?: number;
}

/**
 * Animated, additive, unlit "power" material for the glowing parts of a
 * tower (flame licks, crystal cores, arc bolts, rune glyphs, ...). Intended
 * to be layered on top of / inside lit MeshStandardMaterial structural
 * geometry, not to replace it — this is what should bloom, the stone/metal
 * frame is what should catch specular highlights from the scene lights.
 */
export function createElementCoreMaterial(
  element: Element,
  tier: 1 | 2 | 3,
  opts: CoreMaterialOptions = {},
): THREE.ShaderMaterial {
  const pal = ELEMENT_PALETTE[element];
  const tierIntensity = [1.35, 1.75, 2.25][tier - 1];
  const material = new THREE.ShaderMaterial({
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
    uniforms: {
      uTime: { value: Math.random() * 20 },
      uColorA: { value: new THREE.Color(pal.coreA) },
      uColorB: { value: new THREE.Color(pal.coreB) },
      uRimColor: { value: new THREE.Color(pal.rim) },
      uIntensity: { value: opts.intensity ?? tierIntensity },
      uScale: { value: opts.scale ?? 1.6 },
      uPattern: { value: PATTERN_ID[element] },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  liveCoreMaterials.add(material);
  return material;
}

/** Advance the animated pattern on every live core material. Call once per frame. */
export function updateTowerVfxTime(elapsedSeconds: number) {
  for (const mat of liveCoreMaterials) {
    mat.uniforms.uTime.value = elapsedSeconds;
  }
}

/** Unregister + dispose a core material (call when a tower is sold/despawned). */
export function releaseTowerCoreMaterial(material: THREE.ShaderMaterial) {
  liveCoreMaterials.delete(material);
  material.dispose();
}
