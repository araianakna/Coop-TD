// Ice surface material — crystalline facets, hairline cracks, frost creep.
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  void main() {
    vec3 base = litBase(uColorEdge);

    // Faceted crystal cells via voronoi; each cell gets a strongly different
    // brightness (some near-white, some deep blue) so the surface reads as
    // cut gem facets catching light differently, not a flat gradient.
    vec2 cellUv = vUv * 7.0;
    vec3 vor = voronoi(cellUv);
    float cellDist = vor.x;
    float facetShade = hash13(vec3(vor.yz, 3.0));
    float facetBand = floor(facetShade * 5.0) / 5.0; // quantize -> distinct cut faces
    vec3 facetDark = mix(uColorEdge, uColorMid, 0.5);
    vec3 facetLight = mix(uColorMid, vec3(1.0), 0.55);
    vec3 facet = mix(facetDark, facetLight, facetBand);

    // Dark faceted edge line (the cut between two gem faces) plus a bright
    // hairline crack glow riding right on top of it.
    float edgeLine = 1.0 - smoothstep(0.0, 0.045, cellDist);
    float crack = 1.0 - smoothstep(0.0, 0.02, cellDist);
    vec3 facetWithEdge = mix(facet, uColorEdge * 0.4, edgeLine * 0.6);
    vec3 crackGlow = uColorCore * crack * 2.6;

    // Frost creep: a slow radial wave sweeping across uv space, brightening
    // whatever it passes over (like frost spreading across a surface).
    float creepPhase = fract(uTime * 0.08);
    float creepDist = distance(vUv, vec2(0.5));
    float creepBand = smoothstep(creepPhase - 0.08, creepPhase, creepDist) *
                       (1.0 - smoothstep(creepPhase, creepPhase + 0.08, creepDist));
    vec3 creepGlow = uColorRim * creepBand * 1.4;

    // Sharp glinting sparkle that catches per-facet, twinkling over time.
    float glintSeed = hash13(vec3(vor.yz, 9.0));
    float glint = smoothstep(0.955, 1.0, glintSeed) *
                  (0.5 + 0.5 * sin(uTime * 6.0 + glintSeed * 40.0));
    vec3 glintColor = vec3(1.0) * glint * 3.0;

    // Broad cool fresnel sheen (wide, not just a thin rim) so the whole
    // silhouette reads as glassy/icy from most angles.
    float sheen = fresnelTerm(1.2);
    vec3 sheenGlow = uColorRim * sheen * 0.9;
    float rim = fresnelTerm(3.0);
    vec3 rimGlow = uColorRim * rim * 1.4;

    vec3 color = facetWithEdge * 1.05 + base * 0.15 + crackGlow * uIntensity + creepGlow + glintColor + sheenGlow + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createIceMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.ice, FRAGMENT_BODY, opts);
}
