// Shared visual theming for the Runeward UI layer: per-element color/identity
// data, and small CSS/SVG-only icon builders (no image assets, per the art
// direction brief). Every component in src/ui/ pulls from here so element
// colors stay consistent across the HUD, shop, fusion panel, and cursors.

import type { Element } from "@/game/types";

export interface ElementTheme {
  element: Element;
  label: string;
  /** Hex core color used for icon fills / glow tint. */
  color: string;
  /** One-word flavor descriptor shown in small print. */
  epithet: string;
}

export const ELEMENT_THEME: Record<Element, ElementTheme> = {
  fire: { element: "fire", label: "Fire", color: "#ff6a3c", epithet: "Scorch" },
  ice: { element: "ice", label: "Ice", color: "#6cd6ff", epithet: "Frost" },
  lightning: { element: "lightning", label: "Lightning", color: "#f5e663", epithet: "Storm" },
  nature: { element: "nature", label: "Nature", color: "#7be08a", epithet: "Growth" },
  earth: { element: "earth", label: "Earth", color: "#c9995f", epithet: "Stone" },
  arcane: { element: "arcane", label: "Arcane", color: "#c58cff", epithet: "Mystery" },
};

/** Raw inline SVG glyph markup (viewBox 0 0 24 24) for each element symbol. */
const ELEMENT_GLYPHS: Record<Element, string> = {
  fire: `<path d="M12 2.2c.9 2.6-.6 3.9-1.8 5.1-1.4 1.4-2.4 2.7-2.4 4.6a4.2 4.2 0 0 0 8.4 0c0-1-.4-1.7-.9-2.5-.3-.5-.6-1-.7-1.6 1.7 1.2 3.4 3.4 3.4 6a6.2 6.2 0 1 1-12.4 0c0-4.6 3.2-7.3 5-9.2.7-.8 1.2-1.5 1.4-2.4z"/>`,
  ice: `<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none">
      <line x1="12" y1="2.5" x2="12" y2="21.5"/>
      <line x1="4" y1="6.75" x2="20" y2="17.25"/>
      <line x1="20" y1="6.75" x2="4" y2="17.25"/>
      <path d="M12 6.5 9.7 8.2 M12 6.5 14.3 8.2 M12 17.5 9.7 15.8 M12 17.5 14.3 15.8"/>
      <path d="M6.9 9.1 6.2 6.5 8.7 7.3 M17.1 9.1 17.8 6.5 15.3 7.3 M6.9 14.9 6.2 17.5 8.7 16.7 M17.1 14.9 17.8 17.5 15.3 16.7"/>
    </g>`,
  lightning: `<path d="M13.2 2 4.6 13.6h5.1l-1.1 8.4 9.8-13.1h-5.6z"/>`,
  nature: `<path d="M12 3.2c-5.6 2-8.6 6-8.6 10.6 0 4.1 3.3 7.1 8.6 7.1s8.6-3 8.6-7.1c0-4.6-3-8.6-8.6-10.6z"/>
    <path d="M12 6.6c.4 5.4 0 10.4 0 14" stroke="#20140c" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.55"/>`,
  earth: `<path d="M12 2.6 20.4 8v8L12 21.4 3.6 16V8z" />
    <path d="M12 2.6v18.8M3.6 8l8.4 5.4 8.4-5.4" stroke="#3a2a17" stroke-width="1" fill="none" opacity="0.4"/>`,
  arcane: `<path d="M12 1.6 14.7 9h7.7l-6.3 4.5 2.5 7.4L12 16.3l-6.6 4.6 2.5-7.4L1.6 9h7.7z"/>`,
};

/** Builds a colored, glowing circular "icon" for the given element. Pure DOM/SVG, no assets. */
export function createElementIcon(element: Element, size = 40): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "rw-icon";
  wrap.dataset.element = element;
  wrap.style.setProperty("--rw-icon-size", `${size}px`);
  wrap.style.setProperty("--rw-icon-color", ELEMENT_THEME[element].color);

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "rw-icon-glyph");
  svg.innerHTML = ELEMENT_GLYPHS[element];
  wrap.appendChild(svg);
  return wrap;
}

/** Small glyph icons used outside the element system (HUD stats, gamepad state, etc). */
const MISC_GLYPHS = {
  coin: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.65"/>
    <path d="M12 8v8M9.6 9.6h4.1a1.7 1.7 0 0 1 0 3.4H10a1.7 1.7 0 0 0 0 3.4h4.4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  heart: `<path d="M12 20.6 3.9 13c-2.2-2.2-2.2-5.6 0-7.6 2.1-2 5.2-1.7 7 .5l1.1 1.3 1.1-1.3c1.8-2.2 4.9-2.5 7-.5 2.2 2 2.2 5.4 0 7.6z"/>`,
  wave: `<path d="M4 6h11.5a3.2 3.2 0 0 1 0 6.4H8.5a3.2 3.2 0 0 0 0 6.4H19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="19" cy="6" r="1.6"/><circle cx="4" cy="18.8" r="1.6"/>`,
  gamepad: `<path d="M6.5 8.5h11a4 4 0 0 1 3.9 4.9l-.7 3a2.6 2.6 0 0 1-4.6.9L14.6 15H9.4l-1.5 2.3a2.6 2.6 0 0 1-4.6-.9l-.7-3a4 4 0 0 1 3.9-4.9z" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M8.2 11v3M6.7 12.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="16" cy="11.3" r="0.9"/><circle cx="18" cy="13.3" r="0.9"/>`,
  mouse: `<rect x="7" y="3" width="10" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <line x1="12" y1="6" x2="12" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  skull: `<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.7 1.4 4.4 2.6 5.6.5.5.7.8.7 1.4v1.3c0 .6.5 1.1 1.1 1.1h1.1v-1.6h1v1.6h2v-1.6h1v1.6h1.1c.6 0 1.1-.5 1.1-1.1v-1.3c0-.6.2-.9.7-1.4 1.2-1.2 2.6-2.9 2.6-5.6A7.5 7.5 0 0 0 12 3z"/>
    <circle cx="9" cy="11" r="1.5" fill="#1a1024"/><circle cx="15" cy="11" r="1.5" fill="#1a1024"/>`,
  crown: `<path d="M4 17.5h16l1.1-9-4.6 3.4L12 5l-4.5 6.9L2.9 8.5z"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="12" cy="15" r="1.4"/>`,
} as const;

export type MiscGlyph = keyof typeof MISC_GLYPHS;

export function createGlyphIcon(name: MiscGlyph, size = 22): HTMLElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.classList.add("rw-glyph", `rw-glyph-${name}`);
  svg.innerHTML = MISC_GLYPHS[name];
  return svg as unknown as HTMLElement;
}
