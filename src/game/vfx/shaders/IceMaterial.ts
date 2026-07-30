// Ice surface material — crystalline facets, hairline cracks, frost creep.
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  void main() {
    vec3 base = litBase(uColorEdge);

    // Faceted crystal cells via voronoi; each cell gets a slightly different
    // brightness so the surface reads as cut facets, not a flat gradient.
    vec2 cellUv = vUv * 9.0;
    vec3 vor = voronoi(cellUv);
    float cellDist = vor.x;
    float facetShade = hash13(vec3(vor.yz, 3.0));
    vec3 facet = mix(uColorEdge, uColorMid, 0.4 + facetShade * 0.6);

    // Hairline cracks glow bright cyan right at cell borders.
    float crack = 1.0 - smoothstep(0.0, 0.07, cellDist);
    vec3 crackGlow = uColorCore * crack * 2.2;

    // Frost creep: a slow radial wave sweeping across uv space, brightening
    // whatever it passes over (like frost spreading across a surface).
    float creepPhase = fract(uTime * 0.08);
    float creepDist = distance(vUv, vec2(0.5));
    float creepBand = smoothstep(creepPhase - 0.08, creepPhase, creepDist) *
                       (1.0 - smoothstep(creepPhase, creepPhase + 0.08, creepDist));
    vec3 creepGlow = uColorRim * creepBand * 1.4;

    // Sharp glinting sparkle that catches per-facet, twinkling over time.
    float glintSeed = hash13(vec3(vor.yz, 9.0));
    float glint = smoothstep(0.982, 1.0, glintSeed) *
                  (0.5 + 0.5 * sin(uTime * 6.0 + glintSeed * 40.0));
    vec3 glintColor = vec3(1.0) * glint * 2.5;

    float rim = fresnelTerm(2.4);
    vec3 rimGlow = uColorRim * rim * 1.3;

    vec3 color = facet * 0.9 + base * 0.25 + crackGlow * uIntensity + creepGlow + glintColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createIceMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.ice, FRAGMENT_BODY, opts);
}
