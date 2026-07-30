import { createNoise2D, type NoiseFunction2D } from "simplex-noise";

/**
 * Shared procedural-noise helpers used by Terrain.ts and Skybox.ts.
 *
 * `makeFbm2D` gives CPU-side fractal Brownian motion for geometry
 * displacement work (vertex height fields, prop placement sampling).
 * `GLSL_NOISE` is a drop-in GLSL string (Ashima simplex noise + fbm)
 * injected into fragment shaders via `onBeforeCompile` / raw ShaderMaterial
 * sources for per-pixel surface/sky detail.
 */

export type Fbm2D = (x: number, z: number) => number;

/** Deterministic-ish seeded fbm sampler returning roughly [-1, 1]. */
export function makeFbm2D(
  seed: number,
  octaves = 4,
  lacunarity = 2.05,
  gain = 0.5,
): Fbm2D {
  const layers: NoiseFunction2D[] = [];
  for (let i = 0; i < octaves; i++) {
    // Cheap seed spreading so each octave layer is decorrelated.
    const layerSeed = (Math.sin((seed + i * 91.7) * 12.9898) * 43758.5453) % 1;
    layers.push(createNoise2D(() => (layerSeed + 1) / 2));
  }
  return (x: number, z: number) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += layers[i](x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  };
}

/** Folds a [-1,1] noise value into a sharp ridge shape, good for mountains/rock. */
export function ridge(v: number): number {
  return 1 - Math.abs(v);
}

export const GLSL_NOISE = /* glsl */ `
  vec3 rw_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 rw_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 rw_permute(vec3 x) { return rw_mod289(((x * 34.0) + 1.0) * x); }

  float rwSnoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = rw_mod289(i);
    vec3 p = rw_permute(rw_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float rwFbm(vec2 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      sum += rwSnoise(p * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.05;
    }
    return norm > 0.0 ? sum / norm : 0.0;
  }
`;
