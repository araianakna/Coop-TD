// Lightning surface material — jittery jagged filament arcs, stark bright
// core with fast falloff, strobing (not smooth) flicker.
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  // Jagged filament: a sine "spine" perturbed by stepped (non-smooth) noise
  // so it reads as a chaotic bolt rather than a smooth wave.
  float filament(vec2 p, float t, float seedOffset) {
    float strobe = floor(t * 26.0 + seedOffset); // hard steps = jitter, not smooth motion
    float jitterA = hash11(strobe) - 0.5;
    float jitterB = hash11(strobe + 91.7) - 0.5;
    float spine = sin(p.x * 9.0 + jitterA * 6.0) * 0.18
                + sin(p.x * 23.0 + jitterB * 11.0) * 0.07;
    float d = abs(p.y - spine);
    return d;
  }

  void main() {
    vec3 base = litBase(uColorEdge) * 0.6;

    float d1 = filament(vUv * vec2(1.0, 6.0) - vec2(0.0, 3.0), uTime, 0.0);
    float d2 = filament(vUv * vec2(1.6, 5.0) - vec2(0.0, 2.5) + 0.31, uTime, 17.0);
    float d3 = filament((vUv.yx) * vec2(1.3, 4.0) - vec2(0.0, 2.0) + 0.61, uTime, 42.0);

    float core = 0.0;
    core += (1.0 - smoothstep(0.0, 0.02, d1)) * 3.0;
    core += (1.0 - smoothstep(0.0, 0.015, d2)) * 2.4;
    core += (1.0 - smoothstep(0.0, 0.012, d3)) * 2.0;

    float glow1 = exp(-d1 * 26.0) * 0.7;
    float glow2 = exp(-d2 * 30.0) * 0.55;
    float glow3 = exp(-d3 * 34.0) * 0.45;
    float glow = glow1 + glow2 + glow3;

    // Hard global strobe: whole surface briefly flashes brighter on a jagged
    // timer, like current surging through the whole piece.
    float strobeSeed = floor(uTime * 9.0);
    float strobeFlash = step(0.92, hash11(strobeSeed)) * 0.9;

    vec3 filamentColor = uColorCore * core + uColorRim * glow;
    vec3 flashColor = uColorMid * strobeFlash;

    float rim = fresnelTerm(1.6);
    vec3 rimGlow = uColorRim * rim * 0.8;

    vec3 color = base + filamentColor * uIntensity + flashColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createLightningMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.lightning, FRAGMENT_BODY, opts);
}
