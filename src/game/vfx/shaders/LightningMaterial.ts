// Lightning surface material — jittery jagged filament arcs, stark bright
// core with fast falloff, strobing (not smooth) flicker.
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  // Jagged filament: a sine "spine" perturbed by stepped (non-smooth) noise
  // so it reads as a chaotic bolt rather than a smooth wave. Returns the
  // distance from p to the bolt's spine, in the band's local coordinates.
  float filament(vec2 p, float t, float seedOffset, float freq) {
    float strobe = floor(t * 22.0 + seedOffset); // hard steps = jitter, not smooth motion
    float jitterA = hash11(strobe + seedOffset * 3.1) - 0.5;
    float jitterB = hash11(strobe + seedOffset * 3.1 + 91.7) - 0.5;
    float spine = sin(p.x * freq + jitterA * 7.0) * 0.22
                + sin(p.x * freq * 2.6 + jitterB * 13.0) * 0.09;
    return abs(p.y - spine);
  }

  // One jagged band running across the surface at "center" (0..1, along the
  // axis perpendicular to travel) with the given orientation. Each band
  // flickers fully on/off on its own hard-stepped timer so only a couple of
  // arcs are "live" at any instant — reads as chaotic bolts, not engraved
  // ribbing.
  float bandGlow(vec2 uv, float center, bool vertical, float seedOffset, inout float core) {
    vec2 p = vertical ? uv.yx : uv;
    p.y -= center;
    float d = filament(p, uTime, seedOffset, 7.0 + seedOffset * 0.3);

    float liveStrobe = floor(uTime * (3.5 + hash11(seedOffset) * 3.0) + seedOffset * 7.0);
    float live = step(0.4, hash11(liveStrobe + seedOffset * 13.7));
    float flicker = 0.35 + 0.65 * live;

    core += (1.0 - smoothstep(0.0, 0.032, d)) * 2.8 * flicker;
    return exp(-d * 8.0) * flicker;
  }

  void main() {
    vec3 base = litBase(uColorEdge) * 0.5 + uColorMid * 0.1;

    float core = 0.0;
    float glow = 0.0;
    glow += bandGlow(vUv, 0.15, false, 0.0, core);
    glow += bandGlow(vUv, 0.42, false, 17.0, core);
    glow += bandGlow(vUv, 0.68, false, 34.0, core);
    glow += bandGlow(vUv, 0.9, false, 45.0, core);
    glow += bandGlow(vUv, 0.28, true, 51.0, core);
    glow += bandGlow(vUv, 0.62, true, 68.0, core);
    glow += bandGlow(vUv, 0.85, true, 79.0, core);

    // Hard global strobe: whole surface briefly flashes brighter on a jagged
    // timer, like current surging through the whole piece.
    float strobeSeed = floor(uTime * 10.0);
    float strobeFlash = step(0.85, hash11(strobeSeed)) * 1.1;

    vec3 filamentColor = uColorCore * core + uColorRim * glow * 0.9;
    vec3 flashColor = uColorMid * strobeFlash * 1.4;

    float rim = fresnelTerm(1.6);
    vec3 rimGlow = uColorRim * rim * 1.0;

    vec3 color = base + filamentColor * uIntensity + flashColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createLightningMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.lightning, FRAGMENT_BODY, opts);
}
