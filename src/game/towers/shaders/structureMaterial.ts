import * as THREE from "three";
import type { Element } from "@/game/types";
import { ELEMENT_PALETTE } from "./coreMaterial";

export type StructureVariant = "metal" | "stone" | "wood" | "crystal";

/**
 * Lit structural material (pedestal, frame, casing) for a tower. Uses real
 * MeshStandardMaterial/MeshPhysicalMaterial so it picks up specular
 * highlights and shadow from the scene's lighting rig — the animated
 * ShaderMaterial from coreMaterial.ts supplies the glow, this supplies the
 * "this is a solid object sitting in the world" read.
 */
export function createStructureMaterial(
  element: Element,
  variant: StructureVariant = "stone",
  tier: 1 | 2 | 3 = 1,
): THREE.Material {
  const pal = ELEMENT_PALETTE[element];
  const edgeGlow = new THREE.Color(pal.coreB);
  const emissiveStrength = [0.1, 0.2, 0.32][tier - 1];

  if (variant === "crystal") {
    // NOTE: transmission-heavy glass looks convincing only with a proper
    // env map feeding the transmission render target; without one (no probe
    // set up in this scene) it degrades to a flat translucent grey and
    // washes out every element's color. Keep transmission low/off and lean
    // on a saturated base color + clearcoat specular instead — reads as
    // "polished colored crystal" reliably in any lighting setup.
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(pal.coreA).lerp(new THREE.Color(pal.coreB), 0.55),
      roughness: 0.22,
      metalness: 0.05,
      transmission: 0.08,
      thickness: 0.3,
      ior: 1.45,
      emissive: edgeGlow,
      emissiveIntensity: emissiveStrength * 1.4,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    });
  }
  if (variant === "metal") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.structure),
      roughness: 0.32,
      metalness: 0.78,
      emissive: edgeGlow,
      emissiveIntensity: emissiveStrength * 0.55,
    });
  }
  if (variant === "wood") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.structureDark).lerp(new THREE.Color(0x7a5a34), 0.7),
      roughness: 0.82,
      metalness: 0.02,
      emissive: edgeGlow,
      emissiveIntensity: emissiveStrength * 0.18,
    });
  }
  // stone
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.structure),
    roughness: 0.86,
    metalness: 0.06,
    emissive: edgeGlow,
    emissiveIntensity: emissiveStrength * 0.3,
  });
}
