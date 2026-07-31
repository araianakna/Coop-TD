import type { Element, TowerDef } from "@/game/types";
import { PixelCanvas } from "./PixelCanvas";
import { elementPalette } from "./Palette";

export const TOWER_SPRITE_SIZE = 28;
/** Fraction down from the sprite's top that represents "ground contact" —
 * Game.ts anchors the drawn sprite here so it visually stands on its tile
 * instead of floating centered on it. Keep in sync with where the pillar's
 * base plinth actually sits. */
export const TOWER_GROUND_FRAC = 24 / TOWER_SPRITE_SIZE;

const cache = new Map<string, HTMLCanvasElement>();

function parseElements(def: TowerDef): [Element, Element | null] {
  const el = def.element as string;
  if (el.includes("+")) {
    const [a, b] = el.split("+") as [Element, Element];
    return [a, b];
  }
  return [el as Element, null];
}

/** Procedural pixel-art tower sprite, keyed by tower id + tier so every
 * placement of the same tower/tier reuses one cached canvas. Single-element
 * base towers get a solid pillar; fusion towers split the pillar and orb
 * down the middle between their two parent elements' palettes so the
 * blend reads at a glance. Taller pillar + bigger orb + halo shards signal
 * tier at a distance, matching the old 3D models' scale-with-tier language. */
export function getTowerSprite(def: TowerDef, tier: 1 | 2 | 3): HTMLCanvasElement {
  const key = `${def.id}:${tier}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const [elA, elB] = parseElements(def);
  const pa = elementPalette(elA);
  const pb = elB ? elementPalette(elB) : pa;

  const pc = new PixelCanvas(TOWER_SPRITE_SIZE);
  const cx = TOWER_SPRITE_SIZE / 2;
  const groundY = 24;

  pc.rect(cx - 8, groundY - 2, 16, 4, "#2a2233");
  pc.rect(cx - 8, groundY - 3, 16, 1, "#4a3f57");

  const pillarTop = tier === 1 ? 14 : tier === 2 ? 9 : 4;
  const halfW = tier === 1 ? 3 : tier === 2 ? 3 : 4;
  const pillarH = groundY - 2 - pillarTop;

  pc.rect(cx - halfW, pillarTop, halfW, pillarH, pa.dark);
  pc.rect(cx, pillarTop, halfW, pillarH, pb.dark);
  pc.rect(cx - halfW + 1, pillarTop, halfW - 1, pillarH, pa.base);
  pc.rect(cx, pillarTop, halfW - 1, pillarH, pb.base);
  pc.rect(cx - halfW + 1, pillarTop, 1, pillarH, pa.light);
  pc.rect(cx + halfW - 2, pillarTop, 1, pillarH, pb.light);

  const orbR = tier === 1 ? 3 : tier === 2 ? 4 : 5;
  const orbY = pillarTop - orbR + 2;
  pc.circle(cx, orbY, orbR, pa.accent);
  if (elB) {
    for (let y = -orbR; y <= orbR; y++) {
      for (let x = 0; x <= orbR; x++) {
        if (x * x + y * y <= orbR * orbR) pc.px(cx + x, orbY + y, pb.accent);
      }
    }
  }
  pc.circle(cx, orbY, Math.max(1, orbR - 2), "#fff8e8");

  if (tier >= 2) {
    pc.rect(cx - halfW - 2, pillarTop + 2, 2, 2, pa.accent);
    pc.rect(cx + halfW, pillarTop + 2, 2, 2, pb.accent);
  }
  if (tier >= 3) {
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rx = cx + Math.cos(ang) * (orbR + 2);
      const ry = orbY + Math.sin(ang) * (orbR + 2) * 0.65;
      pc.px(rx, ry, i % 2 === 0 ? pa.accent : pb.accent);
    }
  }

  pc.outline("#150e1f");
  const img = pc.toImage();
  cache.set(key, img);
  return img;
}
