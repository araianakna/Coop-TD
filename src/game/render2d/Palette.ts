import type { Element } from "@/game/types";

export interface ElementPalette {
  base: string;
  light: string;
  dark: string;
  accent: string;
}

// Shared 32-bit-color palette per element — every sprite generator (towers,
// enemies, VFX) pulls from this so recolors stay consistent across the game
// instead of each file picking its own slightly-different "fire orange".
export const ELEMENT_PALETTE: Record<Element, ElementPalette> = {
  fire: { base: "#ff5a2e", light: "#ffb347", dark: "#7a1d0a", accent: "#ffe27a" },
  ice: { base: "#4fb8ff", light: "#c9f2ff", dark: "#0f3a5c", accent: "#eafcff" },
  lightning: { base: "#f5e642", light: "#fff9c4", dark: "#5c4b00", accent: "#c6ff3d" },
  nature: { base: "#4caf50", light: "#94e07f", dark: "#1b3d1f", accent: "#d9ff8a" },
  earth: { base: "#a97845", light: "#d9b98a", dark: "#3f2a18", accent: "#ffd27a" },
  arcane: { base: "#b06bff", light: "#e2c2ff", dark: "#301357", accent: "#ff6bf0" },
};

export function elementPalette(el: Element): ElementPalette {
  return ELEMENT_PALETTE[el];
}
