// Fire surface material — flicker, upward turbulence, ember glints.
//
// TIME-UPDATE CONVENTION (same for all 6 files in this directory, see
// index.ts for the full writeup): call `material.userData.update(dt)` once
// per frame with the delta time in seconds. Do not poke uniforms directly.
//
//   const mat = createFireMaterial();
//   mesh.material = mat;
//   // in your render loop:
//   mat.userData.update(dt);
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  void main() {
    vec3 base = litBase(uColorEdge);

    // Upward-scrolling turbulent flicker: sample noise moving in -y so the
    // pattern reads as flame licking upward across the surface.
    vec3 flowP = vec3(vUv * 4.5, uTime * 0.15);
    flowP.y -= uTime * 1.8;
    float flicker = fbm3(flowP);
    flicker += 0.35 * fbm3(flowP * 3.1 + 11.0);
    flicker = clamp(flicker, 0.0, 1.4);

    float veins = smoothstep(0.45, 0.95, flicker);
    vec3 flame = mix(uColorMid, uColorCore, veins) * (1.2 + veins * 1.8);

    // Ember sparkles: sparse bright dots that pop and fade.
    vec2 emberCell = floor(vUv * 26.0);
    float emberSeed = hash13(vec3(emberCell, floor(uTime * 4.0)));
    float emberPulse = fract(uTime * 1.7 + emberSeed * 5.0);
    float ember = step(0.985, emberSeed) * smoothstep(0.0, 0.15, emberPulse) * smoothstep(1.0, 0.7, emberPulse);
    vec3 emberColor = uColorCore * 3.5 * ember;

    float rim = fresnelTerm(2.0);
    vec3 rimGlow = uColorRim * rim * 1.6;

    vec3 color = base * 0.5 + flame * uIntensity + emberColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createFireMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.fire, FRAGMENT_BODY, opts);
}
