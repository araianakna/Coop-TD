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
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(pal.coreB).lerp(new THREE.Color(0xffffff), 0.4),
      roughness: 0.1,
      metalness: 0,
      transmission: 0.5,
      thickness: 0.6,
      ior: 1.45,
      emissive: edgeGlow,
      emissiveIntensity: emissiveStrength,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
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
      color: new THREE.Color(pal.structureDark).lerp(new THREE.Color(0x5a4327), 0.55),
      roughness: 0.88,
      metalness: 0.02,
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
