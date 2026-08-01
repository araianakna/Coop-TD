import type { CellKind } from "@/game/types";
import { PixelCanvas, mulberry32 } from "./PixelCanvas";

// Higher logical resolution than the old 16px placeholder so blade tufts,
// individual pavers and rock shading all have room to read clearly once
// upscaled with nearest-neighbor filtering.
export const TILE_SPRITE_SIZE = 24;
const VARIANTS_PER_KIND = 6;

const cache = new Map<string, HTMLCanvasElement>();

// ---------------------------------------------------------------------
// Local palette (kept private to this file — do not import from Palette.ts)
// ---------------------------------------------------------------------

// Warm "sunny meadow" tone, matched to a mobile-TD reference — but pulled
// back from that reference's full saturation/contrast, which turned out to
// be uncomfortable to look at for long play sessions once tiled across a
// whole viewport (a much bigger, more persistent area than a single
// mockup screenshot). Same warm green direction, tighter lightness range
// (~100–165 instead of ~90–210) so the per-pixel tonal noise and blade
// tufts don't read as flicker.
const GRASS_DARK = "#3a6b34";
const GRASS_BASE = "#4f8a3f";
const GRASS_MID = "#5f9a49";
const GRASS_LIGHT = "#72ab57";
const GRASS_BLADE_HI = "#8ec06c";
const GRASS_BLADE_LO = "#2f5528";

const FLOWER_PETAL = "#fbe58a";
const FLOWER_PETAL2 = "#f7f1d8";
const FLOWER_CENTER = "#d68a35";
const PEBBLE_LIGHT = "#9a9182";
const PEBBLE_DARK = "#5f5849";
const TWIG_COLOR = "#6b4a2c";
const LEAF_COLOR = "#b5622e";

const PATH_MORTAR = "#6b4a2c";
const PATH_STONE = "#d9a15f";
const PATH_STONE_GREY = "#c9a678";

// Curved-road palette — warm packed dirt (not cobblestone), used by
// Game.ts's drawCurvedRoad() to stroke the path as a single smooth ribbon
// following the map's waypoint list instead of blocky per-cell tiles, so
// turns read as an actual curve like the "sunny meadow" reference instead
// of a right-angle stair-step.
export const ROAD_SHADOW = "#5c3d22";
export const ROAD_DARK = "#a06a37";
export const ROAD_BASE = "#c98a4c";
export const ROAD_LIGHT = "#e2ab6c";
export const ROAD_TREAD = "#eec48d";

// Warmed to sit with the sunny-meadow palette above — was a cool purple-grey
// that read as a mismatched leftover from the old moody theme.
const ROCK_BASE = "#8a7a68";
const MOSS = "#5c7a3f";
const MOSS_HI = "#7fa257";

const ARCH_STONE = "#453a56";
const SPAWN_COLOR = "#e26bff";
const SPAWN_GLOW = "#ffb3ff";
const BASE_COLOR = "#6bd4ff";
const BASE_GLOW = "#c8f3ff";
const RUNE_COLOR = "#fff3c4";

// ---------------------------------------------------------------------
// Small color + noise helpers (composed only from plain math — no new
// PixelCanvas API needed)
// ---------------------------------------------------------------------

/** Accepts either "#rrggbb" or an "rgb(r,g,b)" string — shade()'s own output
 * is fed back into itself in a few places (per-stone bevels, per-boulder
 * shading), so this must round-trip both formats or those chained calls
 * silently collapse to black. */
function parseColor(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  return [0, 0, 0];
}

/** Lightens (amt > 0) or darkens (amt < 0) a color, amt clamped to [-1, 1]. */
function shade(color: string, amt: number): string {
  const [r, g, b] = parseColor(color);
  const t = amt >= 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amt));
  const mix = (c: number) => Math.round(c + (t - c) * k);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function hexToRgba(hex: string, a: number): string {
  const [r, g, b] = parseColor(hex);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/** Smooth (low-frequency) value noise in [0, 1] built from a few sine terms
 * with randomized phase/frequency — gives organic tonal blotches instead of
 * per-pixel static, so ground reads as hand-painted patches of color. */
function makeNoise(rng: () => number) {
  const terms = Array.from({ length: 3 }, () => ({
    fx: 0.12 + rng() * 0.22,
    fy: 0.12 + rng() * 0.22,
    px: rng() * Math.PI * 2,
    py: rng() * Math.PI * 2,
    w: 0.5 + rng() * 0.9,
  }));
  return (x: number, y: number) => {
    let v = 0;
    let wsum = 0;
    for (const t of terms) {
      v += t.w * Math.sin(x * t.fx + t.px) * Math.cos(y * t.fy + t.py);
      wsum += t.w;
    }
    return v / wsum / 2 + 0.5;
  };
}

// ---------------------------------------------------------------------
// Grass ("buildable")
// ---------------------------------------------------------------------

function grassTile(variant: number): HTMLCanvasElement {
  const S = TILE_SPRITE_SIZE;
  const pc = new PixelCanvas(S);
  const rng = mulberry32(1000 + variant * 97);
  const noise = makeNoise(mulberry32(1500 + variant * 53));

  // Base tonal patches — smooth banded noise, not speckle, so it reads as
  // natural variation in the turf rather than static.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = noise(x, y);
      const base = n < 0.34 ? GRASS_DARK : n < 0.68 ? GRASS_BASE : GRASS_MID;
      pc.px(x, y, base);
    }
  }

  // Blade tufts — small 2-3px angled clusters (a stem pixel + an offset tip)
  // mixing light and dark blades for depth, scattered across the whole tile.
  const tuftCount = Math.round(S * S * 0.11);
  for (let i = 0; i < tuftCount; i++) {
    const bx = Math.floor(rng() * S);
    const by = Math.floor(rng() * S);
    const dir = rng() > 0.5 ? 1 : -1;
    const bright = rng() > 0.4;
    const mid = bright ? GRASS_LIGHT : GRASS_DARK;
    const tip = bright ? GRASS_BLADE_HI : GRASS_BLADE_LO;
    pc.px(bx, by, mid);
    pc.px(bx + dir, by - 1, tip);
    if (rng() > 0.55) pc.px(bx, by - 1, mid);
  }

  drawGrassAccent(pc, variant, rng, S);
  return pc.toImage();
}

/** Per-variant "hero" detail so the four grass tiles read as genuinely
 * different patches of ground when tiled, not just re-seeded static. */
function drawGrassAccent(pc: PixelCanvas, variant: number, rng: () => number, S: number) {
  const cx = 5 + Math.floor(rng() * (S - 10));
  const cy = 5 + Math.floor(rng() * (S - 10));
  switch (((variant % 6) + 6) % 6) {
    case 0: {
      // Small wildflower cluster.
      for (let i = 0; i < 3; i++) {
        const fx = cx + Math.floor((rng() - 0.5) * 8);
        const fy = cy + Math.floor((rng() - 0.5) * 8);
        const petal = rng() > 0.5 ? FLOWER_PETAL : FLOWER_PETAL2;
        pc.px(fx - 1, fy, petal);
        pc.px(fx + 1, fy, petal);
        pc.px(fx, fy - 1, petal);
        pc.px(fx, fy + 1, petal);
        pc.px(fx, fy, FLOWER_CENTER);
        pc.px(fx, fy + 2, GRASS_DARK);
      }
      break;
    }
    case 1: {
      // Pebble pair, tiny highlight + shadow pixel each so they read as
      // rounded stones rather than flat dots.
      pc.circle(cx, cy, 2, PEBBLE_LIGHT);
      pc.px(cx - 1, cy + 1, PEBBLE_DARK);
      pc.px(cx + 1, cy - 1, "#c9c2b0");
      pc.circle(cx + 4, cy + 3, 1, PEBBLE_DARK);
      pc.px(cx + 4, cy + 2, "#c9c2b0");
      break;
    }
    case 2: {
      // Lush bunched tuft patch — a denser cluster of bright blades.
      for (let i = 0; i < 9; i++) {
        const bx = cx + Math.floor((rng() - 0.5) * 7);
        const by = cy + Math.floor((rng() - 0.5) * 6);
        pc.px(bx, by, GRASS_BLADE_HI);
        pc.px(bx, by - 1, GRASS_LIGHT);
      }
      break;
    }
    case 3: {
      // Fallen twig + leaves.
      for (let i = 0; i < 4; i++) pc.px(cx - 2 + i, cy + Math.floor(i * 0.4), TWIG_COLOR);
      pc.px(cx, cy - 1, LEAF_COLOR);
      pc.px(cx + 2, cy + 1, LEAF_COLOR);
      pc.px(cx - 1, cy + 2, GRASS_DARK);
      break;
    }
    case 4: {
      // Small cut tree stump — a background-object accent matching the
      // reference's scattered stumps, distinct from the twig/pebble motes.
      pc.circle(cx, cy, 3, "#8a5a34");
      pc.circle(cx, cy, 2, "#6b4526");
      pc.circle(cx, cy, 1, "#a9754a");
      pc.px(cx - 1, cy + 3, GRASS_DARK);
      pc.px(cx + 2, cy + 2, GRASS_DARK);
      break;
    }
    default: {
      // Small rounded shrub — a second background-object accent, filling
      // out the "trees/bushes scattered on the grass" theme.
      pc.circle(cx, cy, 3, GRASS_MID);
      pc.circle(cx - 1, cy - 1, 2, GRASS_LIGHT);
      pc.px(cx + 1, cy + 2, GRASS_DARK);
      pc.px(cx - 2, cy + 1, GRASS_DARK);
    }
  }
}

// ---------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------

function pathTile(variant: number): HTMLCanvasElement {
  const S = TILE_SPRITE_SIZE;
  const pc = new PixelCanvas(S);
  const rng = mulberry32(2000 + variant * 131);

  // Warm dirt undercoat — only shows through the thin mortar seams once the
  // pavers go down, but keeps those seams from reading as flat black.
  const dirtNoise = makeNoise(mulberry32(2400 + variant * 17));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      pc.px(x, y, shade(PATH_MORTAR, (dirtNoise(x, y) - 0.5) * 0.3));
    }
  }

  // Offset-brick cobblestone pavers: a jittered brick grid so each stone
  // gets its own irregular silhouette and mini highlight/shadow bevel,
  // while still guaranteeing near-full coverage (thin, consistent mortar
  // seams instead of an unpredictable Voronoi web).
  const brickH = 5 + Math.floor(rng() * 2);
  const brickW = 7 + Math.floor(rng() * 3);
  const rowStart = -1;
  const rowEnd = Math.ceil(S / brickH) + 1;
  for (let r = rowStart; r < rowEnd; r++) {
    const y0 = r * brickH;
    const rowOffset = (((r % 2) + 2) % 2) === 0 ? 0 : brickW / 2;
    const colStart = -2;
    const colEnd = Math.ceil((S + brickW) / brickW) + 2;
    for (let c = colStart; c < colEnd; c++) {
      const x0 = c * brickW - rowOffset;
      const jx0 = Math.round((rng() - 0.5) * 1.6);
      const jy0 = Math.round((rng() - 0.5) * 1.4);
      const jx1 = Math.round((rng() - 0.5) * 1.6);
      const jy1 = Math.round((rng() - 0.5) * 1.4);
      const bx0 = x0 + 1 + jx0;
      const by0 = y0 + 1 + jy0;
      const bx1 = x0 + brickW - 1 + jx1;
      const by1 = y0 + brickH - 1 + jy1;
      const w = bx1 - bx0;
      const h = by1 - by0;
      if (w < 2 || h < 2) continue;
      const grey = rng() > 0.78;
      const base = shade(grey ? PATH_STONE_GREY : PATH_STONE, (rng() - 0.5) * 0.25);
      pc.rect(bx0, by0, w, h, base);
      // 1px bevel: highlight on the top/left faces, shadow on bottom/right —
      // consistent light direction, matches the rock cluster's.
      pc.rect(bx0, by0, w, 1, shade(base, 0.2));
      pc.rect(bx0, by0, 1, h, shade(base, 0.13));
      pc.rect(bx0, by1 - 1, w, 1, shade(base, -0.22));
      pc.rect(bx1 - 1, by0, 1, h, shade(base, -0.16));
    }
  }

  // Worn tread — soft, roughly-centered wear patch where feet fall, so a
  // long stretch of path reads as trodden without assuming a travel axis.
  const wearCx = S / 2 + (rng() - 0.5) * 3;
  const wearCy = S / 2 + (rng() - 0.5) * 3;
  const wearR = S * 0.42;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - wearCx, y - wearCy);
      if (d > wearR) continue;
      const a = (1 - d / wearR) * 0.16;
      pc.px(x, y, `rgba(255,232,190,${a.toFixed(3)})`);
    }
  }

  // Occasional grass fringe creeping in from one edge, for a natural
  // transition against the surrounding turf.
  if (rng() > 0.5) {
    const edge = Math.floor(rng() * 4);
    for (let i = 0; i < 3; i++) {
      const t = Math.floor(rng() * S);
      const [ex, ey] = edge === 0 ? [t, 0] : edge === 1 ? [t, S - 1] : edge === 2 ? [0, t] : [S - 1, t];
      pc.px(ex, ey, GRASS_DARK);
    }
  }

  return pc.toImage();
}

// ---------------------------------------------------------------------
// Blocked (rock cluster)
// ---------------------------------------------------------------------

function drawBoulder(pc: PixelCanvas, cx: number, cy: number, r: number, base: string, rng: () => number) {
  const wobbleSeed = rng() * 10;
  const rr = Math.ceil(r);
  for (let y = -rr; y <= rr; y++) {
    for (let x = -rr; x <= rr; x++) {
      const angle = Math.atan2(y, x);
      const wobble = 1 + 0.12 * Math.sin(angle * 3 + wobbleSeed) + 0.08 * Math.sin(angle * 5 - wobbleSeed);
      const dist = Math.sqrt(x * x + y * y);
      if (dist > r * wobble) continue;
      const nx = x / (r * wobble);
      const ny = y / (r * wobble);
      // Consistent light source: top-left. Smooth continuous gradient (no
      // flat unshaded plateau) so the rock never collapses into a same-tone
      // silhouette against the dark background.
      const light = -nx * 0.7 - ny * 0.72;
      const delta = Math.max(-0.26, Math.min(0.34, light * 0.4));
      pc.px(Math.round(cx + x), Math.round(cy + y), shade(base, delta));
    }
  }
}

function blockedTile(variant: number): HTMLCanvasElement {
  const S = TILE_SPRITE_SIZE;
  const pc = new PixelCanvas(S);
  const rng = mulberry32(3000 + variant * 173);

  // No opaque background fill (left transparent on purpose) — Game.ts now
  // draws real grass underneath every "blocked" cell first and layers this
  // sprite on top, so the boulders sit directly on the field instead of a
  // separate dark tile square (the grass-fringe hack this used to need to
  // fake that blend is gone too, for the same reason: it's real grass now).

  const clusterCx = S * 0.5;
  const clusterCy = S * 0.55;

  const boulderCount = 2 + Math.floor(rng() * 2);
  const boulders: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < boulderCount; i++) {
    boulders.push({
      x: clusterCx + (rng() - 0.5) * S * 0.5,
      y: clusterCy + (rng() - 0.5) * S * 0.4,
      r: S * (0.2 + rng() * 0.15),
    });
  }
  boulders.sort((a, b) => a.y - b.y); // back-to-front

  for (const b of boulders) {
    // Small per-boulder contact shadow (mostly hidden under the boulder
    // itself, just poking out at its base) instead of one big shared blob
    // that would swallow the gaps between rocks.
    pc.circle(b.x + 1, b.y + b.r * 0.55, b.r * 0.85, "rgba(10,6,16,0.4)");
    const base = shade(ROCK_BASE, (rng() - 0.5) * 0.2);
    drawBoulder(pc, b.x, b.y, b.r, base, rng);
    if (rng() > 0.45) {
      // Moss/lichen accent on the shadow side for warmth.
      const mx = Math.round(b.x + (rng() - 0.5) * b.r);
      const my = Math.round(b.y + b.r * 0.4 + rng() * b.r * 0.3);
      pc.px(mx, my, rng() > 0.5 ? MOSS : MOSS_HI);
      pc.px(mx + 1, my, MOSS);
    }
  }

  return pc.toImage();
}

// ---------------------------------------------------------------------
// Spawn / base portals
// ---------------------------------------------------------------------

function portalTile(kind: "spawn" | "base", variant: number): HTMLCanvasElement {
  const S = TILE_SPRITE_SIZE;
  const pc = new PixelCanvas(S);
  const rng = mulberry32((kind === "spawn" ? 4000 : 5000) + variant * 211);
  const cx = S / 2;
  const cy = S / 2;
  const color = kind === "spawn" ? SPAWN_COLOR : BASE_COLOR;
  const glow = kind === "spawn" ? SPAWN_GLOW : BASE_GLOW;

  // No opaque background fill (left transparent on purpose) — this now
  // draws over the same grass + curved road every other cell gets, so a
  // painted-in square backdrop here would show as a hard-edged patch
  // clashing with the road's rounded cap right where it ends.

  // Scattered flagstone floor around the arch.
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2;
    const rr = S * (0.3 + rng() * 0.2);
    pc.px(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), shade(ARCH_STONE, (rng() - 0.5) * 0.3));
  }

  // Outer stone ring, same consistent top-left light source as the rocks.
  const outerR = S * 0.42;
  const oR = Math.ceil(outerR) + 1;
  for (let y = -oR; y <= oR; y++) {
    for (let x = -oR; x <= oR; x++) {
      const d = Math.hypot(x, y);
      if (d > outerR || d < outerR - 2.6) continue;
      const nx = x / outerR;
      const ny = y / outerR;
      const light = -nx * 0.7 - ny * 0.7;
      pc.px(Math.round(cx + x), Math.round(cy + y), shade(ARCH_STONE, light * 0.35));
    }
  }

  // Rune ticks around the ring — base angle offset per variant so
  // deterministic per-cell hashing still gives visibly different tiles.
  const tickBase = (variant / VARIANTS_PER_KIND) * Math.PI * 2;
  const tickCount = 8;
  for (let i = 0; i < tickCount; i++) {
    const a = tickBase + (i / tickCount) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (outerR - 1);
    const y1 = cy + Math.sin(a) * (outerR - 1);
    const x2 = cx + Math.cos(a) * (outerR + 1.4);
    const y2 = cy + Math.sin(a) * (outerR + 1.4);
    pc.px(Math.round(x1), Math.round(y1), RUNE_COLOR);
    pc.px(Math.round(x2), Math.round(y2), RUNE_COLOR);
  }

  // Layered glow rings falling off toward the rim.
  const glowSteps = 5;
  for (let s = glowSteps; s >= 1; s--) {
    const rr = (outerR - 3) * (s / glowSteps);
    const alpha = Math.min(0.5, 0.16 * (1 - s / glowSteps + 0.2));
    pc.circle(cx, cy, rr, hexToRgba(glow, alpha));
  }

  // Portal core.
  pc.circle(cx, cy, outerR * 0.32, color);
  pc.circle(cx, cy, outerR * 0.16, hexToRgba(glow, 0.9));

  return pc.toImage();
}

/** Procedural pixel-art tile, keyed by grid-cell kind + a small variant
 * index (deterministic per-cell so terrain doesn't read as a flat, obviously
 * tiled repeat) — call sites derive `variant` from a hash of the cell coord. */
export function getTileSprite(kind: CellKind, variant: number): HTMLCanvasElement {
  const v = ((variant % VARIANTS_PER_KIND) + VARIANTS_PER_KIND) % VARIANTS_PER_KIND;
  const key = `${kind}:${v}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let img: HTMLCanvasElement;
  switch (kind) {
    case "path":
      img = pathTile(v);
      break;
    case "blocked":
      img = blockedTile(v);
      break;
    case "spawn":
      img = portalTile("spawn", v);
      break;
    case "base":
      img = portalTile("base", v);
      break;
    default:
      img = grassTile(v);
  }
  cache.set(key, img);
  return img;
}
