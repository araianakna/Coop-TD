// Nature surface material — organic curling vine motion, soft pulsing glow,
// leaf-vein patterning.
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  void main() {
    vec3 base = litBase(uColorEdge);

    // Domain-warped fbm = a cheap "curl noise" look: warp the sample point
    // with one noise field before sampling a second, giving swirling vine
    // motion instead of a flat scrolling gradient.
    vec2 uv = vUv * 3.2;
    vec2 warp = vec2(
      fbm3(vec3(uv * 1.4, uTime * 0.12)),
      fbm3(vec3(uv * 1.4 + 5.2, uTime * 0.12))
    );
    vec2 warped = uv + (warp - 0.5) * 1.6;
    float vineField = fbm3(vec3(warped, uTime * 0.2 + 8.0));

    // Thin bright veins where the warped field crosses a narrow band.
    float veinBand = 1.0 - smoothstep(0.0, 0.05, abs(vineField - 0.5));
    vec3 veinColor = uColorCore * veinBand * 2.0;

    vec3 body = mix(uColorEdge, uColorMid, smoothstep(0.2, 0.8, vineField));

    // Soft slow pulse, like the whole surface breathing.
    float pulse = 0.55 + 0.45 * sin(uTime * 1.6);
    vec3 pulseGlow = uColorRim * pulse * 0.5;

    // Leaf/petal dapples: soft round blobs scattered via cellular noise,
    // gently pulsing out of phase with each other.
    vec3 vor = voronoi(vUv * 7.0 + 3.0);
    float leafMask = smoothstep(0.42, 0.0, vor.x);
    float leafPulse = 0.5 + 0.5 * sin(uTime * 1.2 + hash13(vec3(vor.yz, 1.0)) * 6.28);
    vec3 leafColor = mix(uColorMid, uColorCore, leafPulse) * leafMask * 0.9;

    float rim = fresnelTerm(2.2);
    vec3 rimGlow = uColorRim * rim * 1.1;

    vec3 color = base * 0.6 + body * 0.5 + veinColor * uIntensity + pulseGlow + leafColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createNatureMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.nature, FRAGMENT_BODY, opts);
}
