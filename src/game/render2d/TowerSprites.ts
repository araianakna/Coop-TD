import type { Element, TowerDef } from "@/game/types";
import { PixelCanvas } from "./PixelCanvas";
import { elementPalette, type ElementPalette } from "./Palette";

// ---------------------------------------------------------------------------
// Tower pixel art — every tower is built from a small library of *distinct*
// silhouette archetypes (one per base element) plus a secondary "accent"
// motif system for fusion towers, instead of the old one-shape-six-colors
// pillar. Light is treated as coming from the upper-left throughout: every
// shaded surface gets a `light` band toward that corner, a `dark` band away
// from it, and (for the rounder shapes) a small rim highlight — real shading
// passes, not a flat two-tone split.
// ---------------------------------------------------------------------------

const SIZE = 48;
export const TOWER_SPRITE_SIZE = SIZE;
const CX = SIZE / 2;
const GROUND_Y = 38;
/** Fraction down from the sprite's top that represents "ground contact" —
 * Game.ts anchors the drawn sprite here so it visually stands on its tile.
 * Kept accurate to GROUND_Y, where every archetype's plinth/base actually
 * sits. */
export const TOWER_GROUND_FRAC = GROUND_Y / SIZE;
/** Top row of every element's base plinth (3px stone slab sitting just above
 * the ground-contact row) — the row structures visually grow out of. */
const FEET_Y = GROUND_Y - 3;
const OUTLINE = "#140d1a";

const cache = new Map<string, HTMLCanvasElement>();

function parseElements(def: TowerDef): [Element, Element | null] {
  const el = def.element as string;
  if (el.includes("+")) {
    const [a, b] = el.split("+") as [Element, Element];
    return [a, b];
  }
  return [el as Element, null];
}

const ELEMENT_SET = new Set<string>(["fire", "ice", "lightning", "nature", "earth", "arcane", "shadow"]);

/** The tower id is the only place a Grand Fusion's full 3-element
 * composition survives — `def.element` (a `FusionElementPair`) can only
 * ever hold 2 slots, so it's set to whichever 2-element parent happened to
 * be used when the recipe was authored, silently dropping the 3rd element.
 * Ids are always element names joined in `ELEMENTS` order (see
 * GrandFusionMatrix.ts's header comment), so parsing the id back out is
 * the reliable source of truth this file needs to actually render all 3
 * elements instead of just the 2 the parent pair happened to expose. */
function parseIdElements(def: TowerDef): Element[] {
  const idTail = def.id.replace(/^tower_/, "");
  return idTail.split("_").filter((p): p is Element => ELEMENT_SET.has(p));
}

interface VisualElements {
  primary: Element;
  /** First accent element, if any — for a 2-element fusion this is the
   * only accent; for a distinct-triad Grand Fusion it's drawn opposite
   * `accentB` (right anchor) instead of doubled onto both sides. */
  accentA: Element | null;
  /** Second accent element — only set for Grand Fusions whose 3 elements
   * are all distinct, so both non-primary elements get their own dedicated
   * glyph instead of one of them vanishing entirely. */
  accentB: Element | null;
  isGrand: boolean;
}

/** Resolves what actually gets drawn from a tower's id, replacing the old
 * `def.element`-only parse. Base towers and simple 2-element fusions
 * (including same-element Twin fusions) are untouched — the fix only
 * changes Grand Fusion (3-element id) resolution:
 *  - triple-same (X,X,X): pure `primary`, no accents — already reads as a
 *    saturated single-element apex, which is correct.
 *  - duplicate-parent (X,X,Y): `primary` is the doubled element, `accentA`
 *    is the genuinely differentiating 3rd element Y (previously this slot
 *    silently got X again, making these towers indistinguishable from a
 *    plain X tower).
 *  - all-distinct (a,b,c): `primary` is the first in ELEMENTS order,
 *    `accentA`/`accentB` are the other two, each drawn at its own anchor
 *    instead of one of them being dropped. */
function resolveVisualElements(def: TowerDef): VisualElements {
  const idEls = parseIdElements(def);
  if (idEls.length <= 2) {
    const [a, b] = parseElements(def);
    return { primary: a, accentA: b, accentB: null, isGrand: false };
  }
  const [a, b, c] = idEls;
  if (a === b && b === c) return { primary: a, accentA: null, accentB: null, isGrand: true };
  if (a === b) return { primary: a, accentA: c, accentB: null, isGrand: true };
  if (b === c) return { primary: b, accentA: a, accentB: null, isGrand: true };
  return { primary: a, accentA: b, accentB: c, isGrand: true };
}

// ---------------------------------------------------------------------------
// Local colors not covered by the shared element palette — a warm stone base
// (matches the "stone cottage" reference), warm wood for nature trunks, and
// dark gunmetal for the lightning tower's mast/coil hardware.
// ---------------------------------------------------------------------------

const STONE: ElementPalette = { dark: "#241c1c", base: "#544539", light: "#8a7460", accent: "#c9b28f" };
const WOOD: ElementPalette = { dark: "#33210f", base: "#6b4526", light: "#9c6f42", accent: "#c99a5c" };
const METAL: ElementPalette = { dark: "#1d1a24", base: "#454050", light: "#79728a", accent: "#b8c4d6" };
const EMBER = "#fff4cf";
const SPARK = "#ffffff";

// ---------------------------------------------------------------------------
// Drawing primitives, composed entirely from PixelCanvas.px() — polygons,
// thick/thin lines, and directionally-shaded blobs/pillars (light from
// upper-left) so every silhouette gets real multi-tone shading instead of a
// flat fill.
// ---------------------------------------------------------------------------

function fillPoly(pc: PixelCanvas, pts: [number, number][], color: string) {
  const ys = pts.map((p) => p[1]);
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]);
      const xb = Math.round(xs[i + 1]);
      for (let x = xa; x <= xb; x++) pc.px(x, y, color);
    }
  }
}

function strokeLine(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, color: string) {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = -Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 256; guard++) {
    pc.px(ix0, iy0, color);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ix0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

function strokeThick(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, color: string, thickness: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const half = (thickness - 1) / 2;
  for (let t = -half; t <= half + 0.01; t++) {
    strokeLine(pc, x0 + nx * t, y0 + ny * t, x1 + nx * t, y1 + ny * t, color);
  }
}

/** Directionally-shaded elliptical blob (light from upper-left) — used for
 * cairn stones, boulders, canopy foliage, hover discs, etc. */
function shadedBlob(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, pal: ElementPalette, rim?: string) {
  const rrx = Math.max(rx, 0.6);
  const rry = Math.max(ry, 0.6);
  for (let y = -Math.ceil(rry); y <= Math.ceil(rry); y++) {
    for (let x = -Math.ceil(rrx); x <= Math.ceil(rrx); x++) {
      const nx = x / rrx;
      const ny = y / rry;
      if (nx * nx + ny * ny > 1.05) continue;
      const dot = -0.55 * nx - 0.8 * ny;
      let color = pal.base;
      if (dot > 0.45) color = pal.light;
      else if (dot < -0.3) color = pal.dark;
      pc.px(Math.round(cx + x), Math.round(cy + y), color);
    }
  }
  if (rim) {
    for (let y = -Math.ceil(rry); y <= Math.ceil(rry); y++) {
      for (let x = -Math.ceil(rrx); x <= Math.ceil(rrx); x++) {
        const nx = x / rrx;
        const ny = y / rry;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1.05 || d2 < 0.5) continue;
        const dot = -0.55 * nx - 0.8 * ny;
        if (dot > 0.75) pc.px(Math.round(cx + x), Math.round(cy + y), rim);
      }
    }
  }
}

/** Directionally-shaded vertical bar (light band left, shadow band right) —
 * mast/trunk/shaft pillars. */
function shadedPillar(pc: PixelCanvas, x: number, y: number, w: number, h: number, pal: ElementPalette, rim?: string) {
  const band = Math.max(1, Math.round(w * 0.3));
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      let color = pal.base;
      if (xx < band) color = pal.light;
      else if (xx >= w - band) color = pal.dark;
      pc.px(x + xx, y + yy, color);
    }
  }
  if (rim) for (let yy = 0; yy < h; yy++) pc.px(x, y + yy, rim);
}

/** Thin elliptical ring, one pixel per column on the top and bottom arcs —
 * unlike angle-stepped sampling, this stays a hollow ring even when very
 * flat (a shallow "hover halo" around a shaft) instead of filling solid. */
function drawRing(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, color: string) {
  const rxr = Math.max(rx, 1);
  const ryr = Math.max(ry, 1);
  const steps = Math.max(6, Math.round(rxr));
  for (let i = -steps; i <= steps; i++) {
    const t = i / steps;
    const y = ryr * Math.sqrt(Math.max(0, 1 - t * t));
    pc.px(Math.round(cx + t * rxr), Math.round(cy - y), color);
    pc.px(Math.round(cx + t * rxr), Math.round(cy + y), color);
  }
}

/** A hollow rune-ring built from `drawRing` — top arc catches the light,
 * bottom arc sits in shadow, with a few small glyph ticks along the top for
 * texture so it reads as "rune ring", not a plain halo. */
function drawRuneRing(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, pal: ElementPalette) {
  drawRing(pc, cx, cy, rx, ry, pal.light);
  drawRing(pc, cx, cy + Math.max(1, ry * 0.18), rx, ry, pal.dark);
  const tickXs = [-0.62, -0.2, 0.2, 0.62];
  for (const t of tickXs) {
    const y = ry * Math.sqrt(Math.max(0, 1 - t * t));
    pc.px(Math.round(cx + t * rx), Math.round(cy - y - 1), pal.accent);
  }
}

function flamePts(baseX: number, baseY: number, tipX: number, tipY: number, halfW: number): [number, number][] {
  const midY = baseY - (baseY - tipY) * 0.45;
  return [
    [tipX, tipY],
    [baseX + halfW * 0.9, midY],
    [baseX + halfW, baseY],
    [baseX - halfW, baseY],
    [baseX - halfW * 0.9, midY],
  ];
}

/** Layered teardrop flame — dark silhouette, base tone, inner light tongue,
 * white-hot tip. `lean` bends the tip left/right for a licking, organic look. */
function drawFlame(pc: PixelCanvas, baseX: number, baseY: number, height: number, halfW: number, pal: ElementPalette, lean: number) {
  const tipX = baseX + lean * height * 0.3;
  fillPoly(pc, flamePts(baseX, baseY, tipX, baseY - height, halfW), pal.dark);
  fillPoly(pc, flamePts(baseX, baseY + height * 0.05, tipX, baseY - height * 0.9, halfW * 0.68), pal.base);
  fillPoly(pc, flamePts(baseX, baseY - height * 0.12, tipX, baseY - height * 0.72, halfW * 0.38), pal.light);
  pc.px(Math.round(tipX), Math.round(baseY - height * 0.85), EMBER);
}

/** Faceted crystal shard — light-lit left facet, shadowed right facet, thin
 * ridge line down the center, sparkle at the tip. */
function drawCrystal(pc: PixelCanvas, baseX: number, baseY: number, height: number, halfW: number, pal: ElementPalette) {
  const tipX = baseX;
  const tipY = baseY - height;
  const shoulderY = baseY - height * 0.22;
  fillPoly(
    pc,
    [
      [tipX, tipY],
      [baseX - halfW, shoulderY],
      [baseX - halfW * 0.75, baseY],
      [baseX, baseY],
    ],
    pal.light,
  );
  fillPoly(
    pc,
    [
      [tipX, tipY],
      [baseX + halfW, shoulderY],
      [baseX + halfW * 0.75, baseY],
      [baseX, baseY],
    ],
    pal.dark,
  );
  strokeLine(pc, tipX, tipY, baseX, baseY, pal.base);
  pc.px(Math.round(tipX), Math.round(tipY + 1), SPARK);
}

/** Jagged lightning bolt built from a thick shadow pass, a base-tone pass,
 * and a thin bright core — reads as an actual bolt shape, not an orb. */
function drawBolt(pc: PixelCanvas, baseX: number, baseY: number, height: number, halfW: number, pal: ElementPalette) {
  const pts: [number, number][] = [
    [baseX, baseY],
    [baseX - halfW * 0.6, baseY - height * 0.32],
    [baseX + halfW * 0.35, baseY - height * 0.4],
    [baseX - halfW * 0.5, baseY - height * 0.75],
    [baseX + halfW * 0.15, baseY - height],
  ];
  for (let i = 0; i < pts.length - 1; i++) strokeThick(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pal.dark, 4);
  for (let i = 0; i < pts.length - 1; i++) strokeThick(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pal.base, 3);
  for (let i = 0; i < pts.length - 1; i++) strokeThick(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pal.light, 1);
  const tip = pts[pts.length - 1];
  pc.px(Math.round(tip[0]), Math.round(tip[1]), SPARK);
}

// ---------------------------------------------------------------------------
// Shared plinth + grounding shadow
// ---------------------------------------------------------------------------

const FOOTPRINT: Record<Element, number> = {
  fire: 7,
  ice: 6,
  lightning: 5,
  nature: 8,
  earth: 10,
  arcane: 6,
  shadow: 7,
};

function drawPlinth(pc: PixelCanvas, halfW: number) {
  const band = Math.max(1, Math.round(halfW * 0.2));
  for (let yy = 0; yy < 3; yy++) {
    for (let xx = -halfW; xx < halfW; xx++) {
      let color = STONE.base;
      if (xx < -halfW + band) color = STONE.light;
      else if (xx >= halfW - band) color = STONE.dark;
      pc.px(CX + xx, FEET_Y + yy, color);
    }
  }
  pc.rect(CX - halfW, FEET_Y, halfW * 2, 1, STONE.light);
}

/** Soft grounding shadow — drawn AFTER outline() so its translucent pixels
 * never get traced into a hard outline ring. */
function drawGroundShadow(pc: PixelCanvas, halfW: number) {
  const rx = Math.max(2, halfW - 1);
  const ry = 1;
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const nx = x / rx;
      const ny = y / ry;
      if (nx * nx + ny * ny <= 1) pc.px(CX + x, GROUND_Y + y, "rgba(8,5,10,0.3)");
    }
  }
}

/** Total silhouette height budget above the plinth, by tier — every
 * archetype apportions this between its own sub-parts so tier progression
 * reads consistently (taller AND more ornate, never just rescaled). */
function totalHeight(tier: 1 | 2 | 3, grand: boolean): number {
  return [14, 19, 24][tier - 1] + (grand ? 3 : 0);
}

interface StructInfo {
  top: number;
  halfW: number;
}

// ---------------------------------------------------------------------------
// Base-element archetypes — one genuinely distinct silhouette each.
// ---------------------------------------------------------------------------

/** Fire — a stacked stone cairn topped with a real flame shape (not an orb),
 * more/taller tongues and drifting embers at higher tiers. */
function fireStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand);
  const cairnH = Math.round(total * 0.34);
  const flameH = total - cairnH;
  const stoneCount = tier;
  let cy = FEET_Y;
  let rx = 6.4;
  let ry = 3;
  let apexY = FEET_Y;
  const step = cairnH / stoneCount;
  for (let i = 0; i < stoneCount; i++) {
    cy -= i === 0 ? step * 0.75 : step;
    shadedBlob(pc, CX, cy, rx, ry, STONE, STONE.light);
    pc.px(Math.round(CX - rx * 0.3), Math.round(cy), pa.accent);
    if (i > 0) pc.px(Math.round(CX + rx * 0.25), Math.round(cy + 1), pa.accent);
    apexY = cy - ry;
    rx -= 1.1;
    ry -= 0.4;
  }
  const flameBase = apexY + 1.5;
  drawFlame(pc, CX, flameBase, flameH, 3.4 + tier * 0.4, pa, 0);
  if (tier >= 2) drawFlame(pc, CX - 3, flameBase, flameH * 0.62, 2.2, pa, -0.55);
  if (tier >= 3) drawFlame(pc, CX + 3, flameBase, flameH * 0.55, 2, pa, 0.6);
  if (grand) {
    pc.px(Math.round(CX - 6), Math.round(flameBase - flameH * 0.8), pa.accent);
    pc.px(Math.round(CX + 7), Math.round(flameBase - flameH * 0.55), pa.accent);
  }
  return { top: flameBase - flameH - 2, halfW: 7 + (grand ? 1 : 0) };
}

/** Ice — a crystalline spire of angular faceted shards, a crown of smaller
 * satellite shards forming at tier 2-3. */
function iceStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand);
  pc.rect(CX - 7, FEET_Y - 1, 14, 1, pa.light);
  pc.rect(CX - 7, FEET_Y - 1, 3, 1, pa.dark);
  const mainH = total;
  drawCrystal(pc, CX, FEET_Y, mainH, 3.6 + tier * 0.3, pa);
  if (tier >= 2) drawCrystal(pc, CX - 6, FEET_Y, mainH * 0.5, 2.1, pa);
  if (tier >= 3) drawCrystal(pc, CX + 6, FEET_Y, mainH * 0.44, 1.9, pa);
  if (grand) {
    drawCrystal(pc, CX - 9, FEET_Y, mainH * 0.3, 1.4, pa);
    drawCrystal(pc, CX + 9, FEET_Y, mainH * 0.26, 1.3, pa);
  }
  return { top: FEET_Y - mainH - 2, halfW: 7 + (grand ? 1 : 0) };
}

/** Lightning — a coil-wrapped metal mast crowned by an actual jagged bolt
 * shape; more coils and a bigger bolt (plus orbiting sparks) at higher tiers. */
function lightningStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand);
  const mastH = Math.round(total * 0.36);
  const boltH = total - mastH;
  shadedPillar(pc, CX - 1, FEET_Y - mastH, 3, mastH, METAL, METAL.light);
  const coilCount = tier;
  for (let i = 0; i < coilCount; i++) {
    const cy = FEET_Y - 2 - i * Math.max(2, (mastH - 2) / coilCount);
    pc.rect(CX - 3, Math.round(cy), 6, 1, pa.base);
    pc.px(CX - 3, Math.round(cy), pa.light);
    pc.px(CX + 2, Math.round(cy), pa.dark);
  }
  drawBolt(pc, CX, FEET_Y - mastH, boltH, 5.6 + tier * 0.7, pa);
  if (tier >= 2) {
    pc.px(Math.round(CX - 6), Math.round(FEET_Y - mastH - boltH * 0.5), pa.light);
  }
  if (tier >= 3 || grand) {
    pc.px(Math.round(CX + 6), Math.round(FEET_Y - mastH - boltH * 0.35), pa.light);
    pc.px(Math.round(CX - 5), Math.round(FEET_Y - mastH - boltH * 0.75), pa.accent);
  }
  return { top: FEET_Y - mastH - boltH - 2, halfW: 6 + (grand ? 1 : 0) };
}

/** Nature — a wood trunk crowned by a living canopy silhouette; the canopy
 * splits into extra lobes and grows thorns at higher tiers. */
function natureStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand);
  const trunkH = Math.round(total * 0.32);
  const canopySpan = total - trunkH;
  shadedPillar(pc, CX - 2, FEET_Y - trunkH, 4, trunkH, WOOD, WOOD.light);
  const canopyRy = canopySpan / 2 + 1;
  const canopyRx = canopyRy * 1.25 + tier * 0.6;
  const canopyCy = FEET_Y - trunkH - canopyRy * 0.75;
  shadedBlob(pc, CX, canopyCy, canopyRx, canopyRy, pa, pa.light);
  if (tier >= 2) shadedBlob(pc, CX - canopyRx * 0.55, canopyCy + canopyRy * 0.35, canopyRx * 0.5, canopyRy * 0.55, pa, pa.light);
  if (tier >= 3) shadedBlob(pc, CX + canopyRx * 0.55, canopyCy + canopyRy * 0.25, canopyRx * 0.46, canopyRy * 0.5, pa, pa.light);
  if (tier >= 2) {
    strokeLine(pc, CX - canopyRx * 0.8, canopyCy, CX - canopyRx * 1.15, canopyCy - 2, pa.dark);
    strokeLine(pc, CX + canopyRx * 0.8, canopyCy - 1, CX + canopyRx * 1.15, canopyCy - 3, pa.dark);
  }
  if (grand) pc.px(Math.round(CX), Math.round(canopyCy - canopyRy - 1), pa.accent);
  return { top: canopyCy - canopyRy - 2, halfW: Math.round(canopyRx) + 1 + (grand ? 1 : 0) };
}

/** Earth — heavy stacked boulders, wide and blocky rather than a thin
 * pillar; more/bigger boulders and glowing fissures at higher tiers. */
function earthStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand) * 0.78;
  const count = tier + 1;
  let cy = FEET_Y;
  let rx = 8 + (grand ? 1 : 0);
  let ry = 3.4;
  const step = total / count;
  let top = cy;
  for (let i = 0; i < count; i++) {
    cy -= i === 0 ? step * 0.7 : step;
    shadedBlob(pc, CX, cy, rx, ry, pa, pa.light);
    pc.px(Math.round(CX - rx * 0.35), Math.round(cy), pa.accent);
    if (i > 0) pc.px(Math.round(CX + rx * 0.3), Math.round(cy + 0.5), pa.accent);
    top = cy - ry;
    rx -= 1.0;
    ry -= 0.25;
  }
  return { top: top - 2, halfW: 9 + (grand ? 1 : 0) };
}

/** Arcane — hovers clear of the ground (visible gap + its own floating
 * disc), a slim shaft, and orbiting rune rings; more rings and a wider
 * hover gap at higher tiers. */
function arcaneStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand);
  const hoverGap = 3 + Math.floor(tier / 2);
  shadedBlob(pc, CX, FEET_Y - hoverGap, 5.5, 1.8, pa, pa.light);
  const shaftH = Math.round((total - hoverGap) * 0.55);
  shadedPillar(pc, CX - 2, FEET_Y - hoverGap - shaftH, 4, shaftH, pa, pa.light);
  const shaftTop = FEET_Y - hoverGap - shaftH;
  pc.rect(CX - 3, shaftTop - 1, 6, 1, pa.accent);
  const ringCount = tier + (grand ? 1 : 0);
  for (let r = 0; r < ringCount; r++) {
    drawRuneRing(pc, CX, shaftTop - 3, 6.5 + r * 2.4, 2.2 + r * 0.4, pa);
  }
  pc.px(CX, shaftTop - 3, SPARK);
  return { top: shaftTop - 3 - (2.2 + (ringCount - 1) * 0.4) - 3, halfW: 9 + (grand ? 1 : 0) };
}

/** Shadow — a tattered wraith-cloak silhouette: a wide dark hem tapering up
 * into a hooded point, ragged tendrils fraying off the hem, and a glowing
 * violet eye in the hood; more tendrils and a second eye at higher tiers. */
function shadowStructure(pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette): StructInfo {
  const total = totalHeight(tier, grand);
  const hemY = FEET_Y - 1;
  const hemHalfW = 6.5 + tier * 0.5 + (grand ? 1 : 0);
  const hoodY = hemY - total;
  fillPoly(
    pc,
    [
      [CX, hoodY],
      [CX - hemHalfW, hemY],
      [CX - hemHalfW * 0.5, hemY + 1],
      [CX, hemY - total * 0.08],
      [CX + hemHalfW * 0.5, hemY + 1],
      [CX + hemHalfW, hemY],
    ],
    pa.dark,
  );
  fillPoly(
    pc,
    [
      [CX, hoodY + 1.5],
      [CX - hemHalfW * 0.5, hemY],
      [CX, hemY - total * 0.05],
    ],
    pa.base,
  );
  const tendrilCount = 2 + tier;
  for (let i = 0; i < tendrilCount; i++) {
    const t = tendrilCount === 1 ? 0 : i / (tendrilCount - 1) - 0.5;
    const tx = CX + t * hemHalfW * 1.7;
    strokeLine(pc, tx, hemY, tx + t * 2, hemY + 2 + Math.abs(t) * 1.6, pa.dark);
  }
  pc.px(Math.round(CX), Math.round(hoodY + total * 0.16), pa.accent);
  if (tier >= 2) pc.px(Math.round(CX - hemHalfW * 0.3), Math.round(hoodY + total * 0.26), pa.accent);
  if (grand) pc.px(Math.round(CX + hemHalfW * 0.3), Math.round(hoodY + total * 0.26), pa.light);
  return { top: hoodY - 1, halfW: Math.round(hemHalfW) };
}

const STRUCTURES: Record<Element, (pc: PixelCanvas, tier: 1 | 2 | 3, grand: boolean, pa: ElementPalette) => StructInfo> = {
  fire: fireStructure,
  ice: iceStructure,
  lightning: lightningStructure,
  nature: natureStructure,
  earth: earthStructure,
  arcane: arcaneStructure,
  shadow: shadowStructure,
};

// ---------------------------------------------------------------------------
// Fusion accent motifs — small secondary-element details woven onto the
// primary archetype at a couple of anchor points, so a fusion tower reads
// as a genuine hybrid (a distinct secondary shape in the secondary color)
// rather than a literal vertical color split.
// ---------------------------------------------------------------------------

interface Anchors {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  topX: number;
  topY: number;
}

function anchorsFor(info: StructInfo): Anchors {
  const midSpan = FEET_Y - info.top;
  return {
    leftX: CX - info.halfW - 2,
    leftY: info.top + midSpan * 0.42,
    rightX: CX + info.halfW + 2,
    rightY: info.top + midSpan * 0.6,
    topX: CX,
    topY: info.top - 2,
  };
}

/** Every accent function takes an optional `onlySide`: undefined means "the
 * single secondary element of a 2-element fusion or duplicate-parent Grand
 * Fusion" and reproduces the original right-always/left-at-tier2+ look;
 * "right"/"left" means "one of TWO distinct accent elements on an
 * all-distinct-triad Grand Fusion", so each draws only its own side, always
 * visible from tier 1 (there's no other copy of that element anywhere else
 * on the sprite to fall back on). */
type OnlySide = "left" | "right" | undefined;

function fireAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  if (onlySide !== "left") drawFlame(pc, a.rightX, a.rightY + 3, 5 + tier, 1.8, pb, 0.4);
  if (onlySide === "left" || (onlySide === undefined && tier >= 2)) drawFlame(pc, a.leftX, a.leftY + 3, 4 + tier, 1.5, pb, -0.4);
  if (grand && onlySide !== "left") pc.px(Math.round(a.topX + 4), Math.round(a.topY), pb.accent);
}

function iceAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  if (onlySide !== "left") drawCrystal(pc, a.rightX, a.rightY + 3, 5 + tier * 0.7, 1.7, pb);
  if (onlySide === "left" || (onlySide === undefined && tier >= 2)) drawCrystal(pc, a.leftX, a.leftY + 3, 4 + tier * 0.6, 1.5, pb);
  if (grand && onlySide !== "left") pc.px(Math.round(a.topX - 4), Math.round(a.topY + 1), SPARK);
}

function lightningAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  if (onlySide !== "left") drawBolt(pc, a.rightX, a.rightY + 4, 6 + tier, 2.4, pb);
  if (onlySide === "left" || (onlySide === undefined && tier >= 2)) drawBolt(pc, a.leftX, a.leftY + 4, 5 + tier, 2, pb);
  if (grand && onlySide !== "left") pc.px(Math.round(a.topX), Math.round(a.topY - 1), pb.light);
}

function natureAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  if (onlySide !== "left") {
    strokeLine(pc, a.rightX + 1, FEET_Y, a.rightX, a.rightY, pb.dark);
    shadedBlob(pc, a.rightX, a.rightY, 1.7, 1.4, pb, pb.light);
  }
  if (onlySide === "left" || (onlySide === undefined && tier >= 2)) {
    strokeLine(pc, a.leftX - 1, FEET_Y, a.leftX, a.leftY, pb.dark);
    shadedBlob(pc, a.leftX, a.leftY, 1.5, 1.2, pb, pb.light);
  }
  if (grand && onlySide !== "left") pc.px(Math.round(a.topX - 3), Math.round(a.topY), pb.accent);
}

function earthAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  if (onlySide !== "left") shadedBlob(pc, a.rightX, a.rightY + 3, 2.6, 2, pb, pb.light);
  if (onlySide === "left" || (onlySide === undefined && tier >= 2)) shadedBlob(pc, a.leftX, a.leftY + 3, 2.2, 1.7, pb, pb.light);
  if (grand && onlySide !== "left") pc.px(Math.round(a.rightX), Math.round(a.rightY + 1), pb.accent);
}

function arcaneAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  const offsetX = onlySide === "left" ? -info.halfW * 0.6 : onlySide === "right" ? info.halfW * 0.6 : 0;
  const cx = a.topX + offsetX;
  drawRuneRing(pc, cx, a.topY + 3, info.halfW * (onlySide ? 0.42 : 0.55), 1.8, pb);
  if (onlySide !== undefined || tier >= 2) drawRuneRing(pc, cx, a.topY + (onlySide ? 3 : 6), info.halfW * (onlySide ? 0.5 : 0.7), 2.1, pb);
  pc.px(Math.round(cx), Math.round(a.topY + 3), pb.light);
  if (grand && onlySide !== "left") pc.px(Math.round(a.leftX), Math.round(a.leftY), pb.accent);
}

function shadowAccent(pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) {
  const a = anchorsFor(info);
  if (onlySide !== "left") {
    pc.px(Math.round(a.rightX), Math.round(a.rightY + 2), pb.accent);
    strokeLine(pc, a.rightX, a.rightY + 4, a.rightX + 1, a.rightY + 6, pb.dark);
  }
  if (onlySide === "left" || (onlySide === undefined && tier >= 2)) {
    pc.px(Math.round(a.leftX), Math.round(a.leftY + 2), pb.accent);
    strokeLine(pc, a.leftX, a.leftY + 4, a.leftX - 1, a.leftY + 6, pb.dark);
  }
  if (grand && onlySide !== "left") pc.px(Math.round(a.topX), Math.round(a.topY), pb.light);
}

const ACCENTS: Record<Element, (pc: PixelCanvas, info: StructInfo, tier: 1 | 2 | 3, grand: boolean, pb: ElementPalette, onlySide?: OnlySide) => void> = {
  fire: fireAccent,
  ice: iceAccent,
  lightning: lightningAccent,
  nature: natureAccent,
  earth: earthAccent,
  arcane: arcaneAccent,
  shadow: shadowAccent,
};

/** Grand Fusion capstone flourish — a gentle arc of alternating-color
 * sparkle motes crowning the whole structure, plus a wider plinth (handled
 * by the caller via FOOTPRINT+1). Reads as "more ornate/imposing", not just
 * "bigger". */
function drawGrandFlourish(pc: PixelCanvas, info: StructInfo, colorA: string, colorB: string) {
  const motes = 7;
  for (let i = 0; i < motes; i++) {
    const t = (i / (motes - 1)) * 2 - 1;
    const dx = t * (info.halfW + 4);
    const dy = -2 - (1 - t * t) * 3.5;
    pc.px(Math.round(CX + dx), Math.round(info.top + dy), i % 2 === 0 ? colorA : colorB);
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Procedural pixel-art tower sprite, keyed by tower id + tier so every
 * placement of the same tower/tier reuses one cached canvas. Base towers get
 * a distinct per-element silhouette (see the *Structure functions above);
 * fusion towers grow their first element's archetype as the primary
 * silhouette and weave the second element's motif in as accent details at a
 * couple of anchor points, so the blend reads as a real hybrid rather than a
 * literal vertical split. Grand Fusions (tri-element capstones, resolved via
 * `resolveVisualElements` from the id — `def.element` only ever exposes 2 of
 * the 3) get the same treatment scaled up: a duplicate-parent triad
 * (X,X,Y) draws Y as the accent instead of silently vanishing, and an
 * all-distinct triad (a,b,c) draws b and c as two independent accents on
 * opposite sides instead of one of them being dropped — every Grand Fusion
 * now visibly carries all 3 of its elements, plus a sparkle-crown flourish. */
export function getTowerSprite(def: TowerDef, tier: 1 | 2 | 3): HTMLCanvasElement {
  const key = `${def.id}:${tier}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { primary, accentA, accentB, isGrand } = resolveVisualElements(def);
  const pa = elementPalette(primary);
  const paletteA = accentA ? elementPalette(accentA) : null;
  const paletteB = accentB ? elementPalette(accentB) : null;

  const pc = new PixelCanvas(SIZE);

  const footprint = FOOTPRINT[primary] + (isGrand ? 1 : 0);
  if (primary !== "arcane") drawPlinth(pc, footprint);

  const info = STRUCTURES[primary](pc, tier, isGrand, pa);

  if (accentA && paletteA) {
    // Two distinct accent elements (all-3-different Grand Fusion) each get
    // their own side; a single accent element (everything else) keeps the
    // original both-sides-tier-gated look.
    ACCENTS[accentA](pc, info, tier, isGrand, paletteA, accentB ? "right" : undefined);
  }
  if (accentB && paletteB) {
    ACCENTS[accentB](pc, info, tier, isGrand, paletteB, "left");
  }
  if (isGrand) {
    const flourishColorA = (paletteB ?? paletteA ?? pa).accent;
    const flourishColorB = pa.light;
    drawGrandFlourish(pc, info, flourishColorA, flourishColorB);
  }

  pc.outline(OUTLINE);
  drawGroundShadow(pc, footprint);

  const img = pc.toImage();
  cache.set(key, img);
  return img;
}
