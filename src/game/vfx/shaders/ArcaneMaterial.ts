// Arcane surface material — geometric rune/glyph shapes, clean rotating
// rings, cool violet/magenta glow with hard edges (not soft sparkle-spam).
// Orbiting *particles* (as opposed to this surface pattern) belong to
// ParticleSystem/ImpactVfx — this shader supplies the rune-covered "body".
// Time-update convention: see index.ts. Call `material.userData.update(dt)`
// once per frame.
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementSurfaceMaterial, type SurfaceMaterialOptions } from "./glslCommon";
import type * as THREE from "three";

const FRAGMENT_BODY = /* glsl */ `
  // Hard-edged SDFs so glyphs read as clean geometry, not soft blobs.
  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  float sdTriangle(vec2 p, float r) {
    const float k = 1.7320508; // sqrt(3)
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }
  float ring(vec2 p, float r, float w) {
    return abs(length(p) - r) - w;
  }

  void main() {
    vec3 base = litBase(uColorEdge);

    // Grid of glyph cells; each cell picks a shape + on/off timing from a
    // hash so glyphs blink in/out across the surface like active runes.
    vec2 grid = vUv * 6.0;
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float cellSeed = hash13(vec3(cell, 1.0));
    float cyclePhase = fract(uTime * 0.25 + cellSeed);
    float glyphActive = smoothstep(0.0, 0.1, cyclePhase) * smoothstep(1.0, 0.85, cyclePhase);

    float shapeSel = fract(cellSeed * 7.0);
    float d;
    if (shapeSel < 0.34) {
      d = sdBox(rot2(local, cellSeed * 6.28), vec2(0.22));
    } else if (shapeSel < 0.67) {
      d = sdTriangle(rot2(local, -cellSeed * 6.28), 0.24);
    } else {
      d = ring(local, 0.22, 0.045);
    }
    float glyphLine = 1.0 - smoothstep(0.0, 0.03, abs(d));
    vec3 glyphColor = uColorCore * glyphLine * glyphActive * 2.2;

    // Clean concentric rings sweeping outward from the surface center,
    // giving a "channeling power" read distinct from fire/nature glow.
    vec2 centered = vUv - 0.5;
    float radius = length(centered);
    float sweep = fract(radius * 5.0 - uTime * 0.6);
    float ringLine = 1.0 - smoothstep(0.0, 0.05, abs(sweep - 0.5) * 2.0 - 0.9);
    vec3 ringColor = uColorRim * ringLine * 0.8;

    // Slow violet body pulse.
    float pulse = 0.6 + 0.4 * sin(uTime * 1.1);
    vec3 body = mix(uColorEdge, uColorMid, pulse * 0.6);

    float rim = fresnelTerm(2.0);
    vec3 rimGlow = uColorRim * rim * 1.4;

    vec3 color = base * 0.35 + body * 0.5 + glyphColor * uIntensity + ringColor + rimGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createArcaneMaterial(opts?: SurfaceMaterialOptions): THREE.ShaderMaterial {
  return createElementSurfaceMaterial(ELEMENT_PALETTES.arcane, FRAGMENT_BODY, opts);
}
