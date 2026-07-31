// Shared GLSL snippets injected into every element ShaderMaterial in this
// directory. Kept dependency-free (no textures) so materials work anywhere.
import * as THREE from "three";
import type { ElementPalette } from "@/game/vfx/palette";

export const GLSL_NOISE = /* glsl */ `
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash23(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  // Value noise, 3D.
  float vnoise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm3(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * vnoise3(p);
      p *= 2.02;
      amp *= 0.52;
    }
    return sum;
  }

  vec2 rot2(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  // Cellular / voronoi F1 distance + cell id, used for crystal facets, cracks,
  // and rock texture.
  vec3 voronoi(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float minDist = 8.0;
    vec2 minPoint = vec2(0.0);
    vec2 cellId = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 point = hash23(vec3(ip + neighbor, 0.0));
        vec2 diff = neighbor + point - fp;
        float dist = length(diff);
        if (dist < minDist) {
          minDist = dist;
          minPoint = point;
          cellId = ip + neighbor;
        }
      }
    }
    return vec3(minDist, cellId);
  }
`;

/** Shared varyings + vertex shader body: world position, view-space normal,
 * a view direction for fresnel, and plain uv. All element materials use the
 * same vertex stage since the visual variety lives entirely in the fragment
 * shader. */
export const GLSL_SURFACE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/** Shared fragment-shader preamble: varyings + a simple fixed-key-light lit
 * base term + fresnel rim term. Each element's fragment shader appends its
 * own emissive pattern on top of `lit` and `rim`. */
export const GLSL_SURFACE_FRAG_PREAMBLE = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec3 uColorCore;
  uniform vec3 uColorMid;
  uniform vec3 uColorEdge;
  uniform vec3 uColorRim;
  uniform float uIntensity;

  const vec3 KEY_LIGHT_DIR = normalize(vec3(-22.0, 34.0, 18.0));

  vec3 litBase(vec3 baseColor) {
    float diff = max(dot(vNormalW, KEY_LIGHT_DIR), 0.0);
    float ambient = 0.38;
    return baseColor * (ambient + diff * 0.75);
  }

  float fresnelTerm(float power) {
    return pow(1.0 - clamp(dot(vNormalW, vViewDir), 0.0, 1.0), power);
  }
`;

export interface SurfaceMaterialOptions {
  /** Overall glow/emissive strength multiplier, e.g. bump for tier-3 towers. */
  intensity?: number;
}

/**
 * Shared factory used by every `create<Element>Material()` in this
 * directory. Wires up the standard uniform set, standard vertex stage, and
 * attaches the `.userData.update(dt)` time-advance convention (see
 * index.ts for the full doc).
 */
export function createElementSurfaceMaterial(
  palette: ElementPalette,
  fragmentBody: string,
  opts?: SurfaceMaterialOptions,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorCore: { value: palette.core.clone() },
      uColorMid: { value: palette.mid.clone() },
      uColorEdge: { value: palette.edge.clone() },
      uColorRim: { value: palette.rim.clone() },
      uIntensity: { value: opts?.intensity ?? 1 },
    },
    vertexShader: GLSL_SURFACE_VERTEX,
    fragmentShader: GLSL_SURFACE_FRAG_PREAMBLE + GLSL_NOISE + fragmentBody,
  });
  material.userData.update = (dt: number) => {
    material.uniforms.uTime.value += dt;
  };
  return material;
}
