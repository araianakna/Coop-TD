// Single source of truth for each element's color identity. Every VFX piece
// (surface shaders, particle bursts, projectiles, impacts) pulls from here so
// "fire" reads as the same fire everywhere in the game.
import * as THREE from "three";
import type { Element } from "@/game/types";

export interface ElementPalette {
  /** Brightest, bloom-triggering color (particle cores, emissive veins). */
  core: THREE.Color;
  /** Mid-tone body color. */
  mid: THREE.Color;
  /** Dark edge/shadow color, also used as unlit surface base. */
  edge: THREE.Color;
  /** Rim-light / fresnel accent color. */
  rim: THREE.Color;
}

function pal(core: number, mid: number, edge: number, rim: number): ElementPalette {
  return {
    core: new THREE.Color(core),
    mid: new THREE.Color(mid),
    edge: new THREE.Color(edge),
    rim: new THREE.Color(rim),
  };
}

export const ELEMENT_PALETTES: Record<Element, ElementPalette> = {
  fire: pal(0xffb347, 0xff5a1f, 0x230904, 0xff8a2e),
  ice: pal(0xd6f6ff, 0x6fc3e8, 0x0c1b26, 0xaef2ff),
  lightning: pal(0xf2f8ff, 0x8fb8ff, 0x0a0a1a, 0xc9e2ff),
  nature: pal(0xb6ff6b, 0x3fa855, 0x0c1f12, 0x8bff9a),
  earth: pal(0xd99a4e, 0x7a5a3a, 0x1c140f, 0xb87a3f),
  arcane: pal(0xe28bff, 0x9a3fe0, 0x150a24, 0xd68bff),
  shadow: pal(0x9c7fe0, 0x5a3d8f, 0x0d0716, 0xc8f0ff),
};

/** Approximate direction of the scene's key sun light (see core/Lighting.ts). */
export const KEY_LIGHT_DIR: [number, number, number] = [-22, 34, 18];
