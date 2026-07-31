// Earth surface material — heavy, chunky, cracked-rock texture, low and
// grounded motion. Deliberately the least "glowy" element: bloom stays
// subtle here so earth reads as heavy/inert next to the flashier elements.
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  void main() {
    // Chunky faceted shading: quantize the fbm value into hard bands so
    // shading steps like a low-poly rock face instead of smoothly blending.
    vec3 p = vec3(vUv * 5.0, 0.0);
    float bump = fbm3(p);
    float banded = floor(bump * 6.0) / 6.0;
    vec3 rockBase = mix(uColorEdge, uColorMid, banded);

    vec3 lit = litBase(rockBase);

    // Cracked-rock cell pattern: dark deep cracks between chunky plates.
    vec3 vor = voronoi(vUv * 6.0);
    float crackDist = vor.x;
    float crack = 1.0 - smoothstep(0.0, 0.045, crackDist);
    vec3 crackShadow = mix(lit, uColorEdge * 0.3, crack);

    // A slow, low-amplitude molten-vein glimmer deep in the cracks — heavy
    // and infrequent, not sparkly like fire.
    float emberSeed = hash13(vec3(vor.yz, 4.0));
    float slowPulse = 0.5 + 0.5 * sin(uTime * 0.6 + emberSeed * 6.28);
    float emberMask = step(0.9, emberSeed) * crack * slowPulse;
    vec3 emberGlow = uColorCore * emberMask * 1.1;

    // Faint dust motes drifting very slowly downward (grounded, not
    // floating) — kept subtle.
    vec2 dustUv = vUv * 14.0 + vec2(0.0, uTime * 0.05);
    float dust = smoothstep(0.985, 1.0, hash13(vec3(floor(dustUv), 0.0)));
    vec3 dustColor = uColorRim * dust * 0.5;

    float rim = fresnelTerm(3.2) * 0.4; // muted rim: earth doesn't shimmer
    vec3 rimGlow = uColorRim * rim;

    vec3 color = crackShadow * uIntensity + emberGlow + dustColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createEarthMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.earth, FRAGMENT_BODY, opts);
}
