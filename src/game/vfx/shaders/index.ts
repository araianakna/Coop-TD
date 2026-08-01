/**
 * ============================================================================
 * Element surface shader materials — CONVENTION (read this before consuming)
 * ============================================================================
 *
 * One `create<Element>Material()` factory per element (Fire, Ice, Lightning,
 * Nature, Earth, Arcane). Each returns a plain `THREE.ShaderMaterial` you can
 * assign directly to any mesh:
 *
 *   import { createFireMaterial } from "@/game/vfx/shaders";
 *
 *   const mat = createFireMaterial();
 *   towerSpireMesh.material = mat;
 *
 * TIME-UPDATE CONVENTION (identical across all 6 — pick this and only this):
 *
 *   material.userData.update(dt);   // dt = delta time in SECONDS
 *
 * Call it once per material per frame (e.g. from your model's own update()).
 * It advances `uniforms.uTime.value` internally — never write
 * `material.uniforms.uTime.value` directly, since that couples your code to
 * an implementation detail that may grow (multiple time-driven uniforms,
 * per-instance phase offsets, etc.) without warning.
 *
 * If you have many instances of the same element (e.g. a dozen fire towers),
 * each `create*Material()` call returns an independent material with its own
 * uniforms — call `.userData.update(dt)` on every instance you own, or share
 * one material across meshes that should animate in lockstep (e.g. clones of
 * the same tower tier).
 *
 * OPTIONAL CONSTRUCTOR ARG: `create<Element>Material({ intensity })` scales
 * emissive strength (e.g. `intensity: 1.4` for a tier-3 tower's showier
 * glow). Omit it for the default (1.0).
 *
 * These materials expect vertex attributes `position`, `normal`, `uv` (any
 * standard BufferGeometry qualifies — box/cylinder/cone/custom all work).
 * They are unlit-with-a-fake-key-light (matching core/Lighting.ts's sun
 * direction) plus a fresnel rim and an element-specific emissive pattern, so
 * they read consistently under the game's ACES/bloom post pipeline without
 * needing real scene lights bound to them.
 * ============================================================================
 */
export { createFireMaterial } from "./FireMaterial";
export { createIceMaterial } from "./IceMaterial";
export { createLightningMaterial } from "./LightningMaterial";
export { createNatureMaterial } from "./NatureMaterial";
export { createEarthMaterial } from "./EarthMaterial";
export { createArcaneMaterial } from "./ArcaneMaterial";
export type { SurfaceMaterialOptions } from "./glslCommon";

import type { Element } from "@/game/types";
import type * as THREE from "three";
import { createFireMaterial } from "./FireMaterial";
import { createIceMaterial } from "./IceMaterial";
import { createLightningMaterial } from "./LightningMaterial";
import { createNatureMaterial } from "./NatureMaterial";
import { createEarthMaterial } from "./EarthMaterial";
import { createArcaneMaterial } from "./ArcaneMaterial";
import type { SurfaceMaterialOptions } from "./glslCommon";

const FACTORIES: Record<Element, (opts?: SurfaceMaterialOptions) => THREE.ShaderMaterial> = {
  fire: createFireMaterial,
  ice: createIceMaterial,
  lightning: createLightningMaterial,
  nature: createNatureMaterial,
  earth: createEarthMaterial,
  arcane: createArcaneMaterial,
  // No bespoke shader yet — this whole legacy Three.js shader module is
  // unused by the live 2D renderer (see render2d/*), so shadow borrows
  // arcane's material rather than authoring a new unused GLSL pass.
  shadow: createArcaneMaterial,
};

/** Convenience lookup when you have an `Element` value rather than a literal
 * import name, e.g. building a tower model generically from `TowerDef.element`. */
export function createElementMaterial(
  element: Element,
  opts?: SurfaceMaterialOptions,
): THREE.ShaderMaterial {
  return FACTORIES[element](opts);
}
