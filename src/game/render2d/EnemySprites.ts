import type { EnemyDef } from "@/game/types";
import { PixelCanvas } from "./PixelCanvas";

export const ENEMY_SPRITE_SIZE = 30;
export const BOSS_SPRITE_SIZE = 52;
/** Fraction down from the sprite's top that represents "ground contact" —
 * Game.ts anchors the drawn sprite here so it visually stands on its tile
 * instead of floating centered on it. Keep in sync with where the drawXxx()
 * body functions actually plant the creature's feet/base/mound line. */
export const ENEMY_GROUND_FRAC = 0.76;

// ---------------------------------------------------------------------------
// Palette — hand-picked per-enemy hues so each of the 13 regular/boss
// silhouettes reads as "that" creature at a glance (embers for cinderling,
// icy white for frostfang, storm purple for the flying boss...). `body` is
// the mid-tone; `bodyDark`/`accent`/`eye` seed a full multi-tone shading
// ramp (see `makeTones`) rather than being used as flat fills directly.
// ---------------------------------------------------------------------------
interface EnemyVisual {
  body: string;
  bodyDark: string;
  accent: string;
  eye: string;
}

const VISUALS: Record<string, EnemyVisual> = {
  thornling: { body: "#5fae4c", bodyDark: "#2e5c26", accent: "#c9ff7a", eye: "#1a2e12" },
  cragback: { body: "#8a7a6b", bodyDark: "#4a4139", accent: "#c9b28f", eye: "#241f1a" },
  skitterwing: { body: "#7a5ea8", bodyDark: "#3c2c5c", accent: "#c9a8ff", eye: "#ffe27a" },
  voltling: { body: "#e8d84a", bodyDark: "#8a7a1c", accent: "#fff9c4", eye: "#2a2405" },
  frostfang: { body: "#a8e0f5", bodyDark: "#4a90b0", accent: "#eafcff", eye: "#0f3a5c" },
  cinderling: { body: "#e8632e", bodyDark: "#8a2e0f", accent: "#ffb347", eye: "#2a0d02" },
  quagbrute: { body: "#6b7a4a", bodyDark: "#38401f", accent: "#9caf6b", eye: "#12160a" },
  sandveil: { body: "#d4b877", bodyDark: "#8a7043", accent: "#f0dca8", eye: "#3a2e14" },
  wraithguard: { body: "#5c4a7a", bodyDark: "#2c1f42", accent: "#b08fff", eye: "#e8d4ff" },
  runeshell: { body: "#8a8a99", bodyDark: "#45455c", accent: "#7affe0", eye: "#1a1a26" },
  cindercolossus: { body: "#e8451f", bodyDark: "#5c1505", accent: "#ffd24d", eye: "#fff2c4" },
  hollowglacier: { body: "#bfe8ff", bodyDark: "#3f7a9c", accent: "#ffffff", eye: "#0a2d45" },
  stormsovereign: { body: "#7a4ab0", bodyDark: "#301357", accent: "#e2c2ff", eye: "#f5e642" },
};

const FALLBACK: EnemyVisual = { body: "#9a8fae", bodyDark: "#4a4159", accent: "#d4c9e8", eye: "#221a2e" };

const cache = new Map<string, HTMLCanvasElement>();

// ---------------------------------------------------------------------------
// Color ramp utilities — derive a believable multi-tone shading ramp
// (specular shine / highlight / base / shadow / deep-shadow) from the small
// hand-picked palette above, instead of hand-authoring 5 colors per enemy.
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}
function mix(hex: string, target: string, amt: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex([a[0] + (b[0] - a[0]) * amt, a[1] + (b[1] - a[1]) * amt, a[2] + (b[2] - a[2]) * amt]);
}
const lighten = (hex: string, amt: number) => mix(hex, "#ffffff", amt);
const darken = (hex: string, amt: number) => mix(hex, "#000000", amt);
function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Tones {
  shine: string;
  hi: string;
  base: string;
  sh: string;
  deep: string;
}

/** Builds a 5-step directional shading ramp from an enemy's hand-picked
 * `body`/`bodyDark` pair — `bodyDark` anchors the shadow end so the
 * existing per-enemy color choices stay in charge of hue, while this adds
 * the extra highlight/shine/deep-shadow steps real shading needs. */
function makeTones(v: EnemyVisual): Tones {
  return {
    shine: lighten(v.body, 0.62),
    hi: lighten(v.body, 0.3),
    base: v.body,
    sh: v.bodyDark,
    deep: darken(v.bodyDark, 0.4),
  };
}

const LIGHT = { x: -0.62, y: -0.78 };

/** Fills an ellipse with directional 4-band shading (upper-left lit) plus a
 * tiny specular fleck — the core "make it look like a solid rounded volume,
 * not a flat blob" primitive used for every body/head/limb mass. */
function shadedEllipse(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, t: Tones, light = LIGHT) {
  rx = Math.max(1, Math.round(rx));
  ry = Math.max(1, Math.round(ry));
  cx = Math.round(cx);
  cy = Math.round(cy);
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const nx = x / rx;
      const ny = y / ry;
      const d = nx * nx + ny * ny;
      if (d > 1.03) continue;
      const l = nx * light.x + ny * light.y;
      const color = l > 0.55 ? t.hi : l > -0.12 ? t.base : l > -0.62 ? t.sh : t.deep;
      pc.px(cx + x, cy + y, color);
    }
  }
  const shx = cx + Math.round(-rx * 0.38);
  const shy = cy + Math.round(-ry * 0.45);
  pc.px(shx, shy, t.shine);
  pc.px(shx + 1, shy, t.shine);
}

function shadedCircle(pc: PixelCanvas, cx: number, cy: number, r: number, t: Tones, light = LIGHT) {
  shadedEllipse(pc, cx, cy, r, r, t, light);
}

/** Directionally-shaded hard-edged block — the blocky counterpart to
 * shadedEllipse. Hard right-angle corners read as "armored/mechanical"
 * next to organic creatures' round silhouettes, so this is the go-to shape
 * for tank torsos, breastplates and chest plates. */
function shadedRect(pc: PixelCanvas, x: number, y: number, w: number, h: number, t: Tones, light = LIGHT) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const w0 = Math.max(1, Math.round(w));
  const h0 = Math.max(1, Math.round(h));
  for (let j = 0; j < h0; j++) {
    for (let i = 0; i < w0; i++) {
      const nx = w0 > 1 ? (i / (w0 - 1)) * 2 - 1 : 0;
      const ny = h0 > 1 ? (j / (h0 - 1)) * 2 - 1 : 0;
      const l = nx * light.x + ny * light.y;
      const color = l > 0.55 ? t.hi : l > -0.12 ? t.base : l > -0.62 ? t.sh : t.deep;
      pc.px(x0 + i, y0 + j, color);
    }
  }
}

/** General filled-triangle scanline rasterizer — the building block for
 * spikes, horns, wings, crowns and capes (things ellipses can't express). */
function triangle(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: string) {
  const minX = Math.floor(Math.min(x0, x1, x2));
  const maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2));
  const maxY = Math.ceil(Math.max(y0, y1, y2));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d1 = (x - x1) * (y0 - y1) - (x0 - x1) * (y - y1);
      const d2 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
      const d3 = (x - x0) * (y2 - y0) - (x2 - x0) * (y - y0);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) pc.px(x, y, color);
    }
  }
}

/** A tapered spike/horn/icicle from base (width `w`) to a point tip, split
 * into a lit half and a shadowed half so even small details read as 3D. */
function spike(pc: PixelCanvas, bx: number, by: number, tx: number, ty: number, w: number, t: Tones) {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const hw = w / 2;
  const b1x = bx + nx * hw;
  const b1y = by + ny * hw;
  const b2x = bx - nx * hw;
  const b2y = by - ny * hw;
  triangle(pc, b1x, b1y, b2x, b2y, tx, ty, t.base);
  triangle(pc, bx, by, b2x, b2y, tx, ty, t.sh);
  triangle(pc, bx, by, b1x, b1y, (b1x + tx) / 2, (b1y + ty) / 2, t.hi);
}

/** Bresenham line — used for plate seams, lava/frost cracks and lightning
 * zigzags. `thickness` > 1 stamps small squares instead of single pixels. */
function line(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, color: string, thickness = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (thickness <= 1) pc.px(x0, y0, color);
    else pc.rect(x0 - Math.floor(thickness / 2), y0 - Math.floor(thickness / 2), thickness, thickness, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function dotEyes(pc: PixelCanvas, cx: number, cy: number, gap: number, r: number, color: string, glow?: string) {
  // Clamp the gap so two eyes never merge into one big blob regardless of
  // what a caller passes — this was a real bug (tiny gap + a wide glow box
  // rendered as one giant square "visor" instead of two eyes). Round pupils
  // (not flat squares) with an alpha-blended soft halo read as an actual
  // glowing eye instead of a solid screen-like block.
  gap = Math.max(gap, r + 2.5);
  for (const s of [-1, 1]) {
    const ex = Math.round(cx + s * gap);
    const ey = Math.round(cy);
    if (glow) {
      const gr = r + 1;
      for (let y = -gr; y <= gr; y++) {
        for (let x = -gr; x <= gr; x++) {
          if (x * x + y * y <= gr * gr + 0.2) pc.px(ex + x, ey + y, toRgba(glow, 0.5));
        }
      }
    }
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + 0.2) pc.px(ex + x, ey + y, color);
      }
    }
  }
}

/** Two-legged stance with a walk-cycle offset: one leg forward, one back,
 * swapping between frame 0/1 so the pair actually reads as a step. */
function walkLegs(pc: PixelCanvas, cx: number, hipY: number, groundY: number, spread: number, w: number, t: Tones, frame: 0 | 1) {
  const h = Math.max(2, groundY - hipY);
  const step = frame === 1 ? 1 : -1;
  const lx = cx - spread + step * 0.6;
  const rx = cx + spread - step * 0.6;
  pc.rect(lx - w / 2, hipY, w, h, t.sh);
  pc.rect(rx - w / 2, hipY, w, h, t.base);
  pc.rect(lx - w / 2, groundY - 1, w, 1, t.deep);
  pc.rect(rx - w / 2, groundY - 1, w, 1, t.deep);
}

/** Hovering shadow blob under flyers — subtly grounds them on their tile
 * even though their feet never touch it. */
function flightShadow(pc: PixelCanvas, cx: number, groundY: number, rx: number) {
  pc.rect(cx - rx, groundY, rx * 2, 2, "rgba(10,8,16,0.28)");
}

/** Sand/dirt mound a burrower emerges from — drawn *over* the lower half of
 * the body so the creature reads as partially buried instead of standing. */
function mound(pc: PixelCanvas, cx: number, topY: number, groundY: number, rx: number, t: Tones) {
  const ry = Math.max(2, groundY - topY);
  shadedEllipse(pc, cx, topY + ry * 0.35, rx, ry, t, { x: -0.3, y: -0.95 });
  for (let i = -1; i <= 1; i++) {
    line(pc, cx + i * rx * 0.55 - rx * 0.22, topY + ry * 0.3, cx + i * rx * 0.55 + rx * 0.22, topY + ry * 0.15, t.deep);
  }
}

// ---------------------------------------------------------------------------
// Per-enemy silhouettes. Each function fully draws one creature into `pc`
// (a fresh size x size logical grid); a single outline() pass over the
// whole silhouette happens once, centrally, after dispatch.
// ---------------------------------------------------------------------------
type Drawer = (pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) => void;

function drawThornling(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.35) });
  const cx = size / 2;
  const bob = frame === 1 ? 1 : 0;
  const bodyCy = size * 0.53 + bob;
  const headCy = size * 0.31 + bob;
  spike(pc, cx - size * 0.1, headCy - size * 0.06, cx - size * 0.22, headCy - size * 0.22, size * 0.07, at);
  spike(pc, cx + size * 0.1, headCy - size * 0.06, cx + size * 0.22, headCy - size * 0.22, size * 0.07, at);
  shadedEllipse(pc, cx, bodyCy, size * 0.2, size * 0.17, t);
  shadedCircle(pc, cx, headCy, size * 0.145, t);
  spike(pc, cx - size * 0.16, bodyCy - size * 0.02, cx - size * 0.3, bodyCy - size * 0.14, size * 0.06, at);
  spike(pc, cx + size * 0.16, bodyCy - size * 0.02, cx + size * 0.3, bodyCy - size * 0.14, size * 0.06, at);
  walkLegs(pc, cx, size * 0.64 + bob, size * ENEMY_GROUND_FRAC, size * 0.1, size * 0.08, t, frame);
  dotEyes(pc, cx, headCy, size * 0.075, 1, v.eye);
}

function drawCragback(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const cx = size / 2;
  const bob = frame === 1 ? 0 : 1;
  const torsoTop = size * 0.32 - bob * 0.3;
  const torsoW = size * 0.5;
  const torsoH = size * 0.34;
  // wide flat-topped rock-plate torso — hard right-angle silhouette reads
  // "armored slab" next to the organic round beasts elsewhere in the roster.
  shadedRect(pc, cx - torsoW / 2, torsoTop, torsoW, torsoH, t);
  // shoulder pauldron bumps overhang the top corners for a heavier top-half
  shadedCircle(pc, cx - torsoW / 2 + size * 0.03, torsoTop + size * 0.02, size * 0.1, t);
  shadedCircle(pc, cx + torsoW / 2 - size * 0.03, torsoTop + size * 0.02, size * 0.1, t);
  // head sunk between the shoulders, mostly hidden — reads as "no neck"
  shadedCircle(pc, cx, torsoTop + size * 0.02, size * 0.12, t);
  // plate seams + rivets across the slab
  line(pc, cx - torsoW / 2 + 1, torsoTop + torsoH * 0.4, cx + torsoW / 2 - 1, torsoTop + torsoH * 0.4, t.deep, 1);
  line(pc, cx - torsoW / 2 + 1, torsoTop + torsoH * 0.75, cx + torsoW / 2 - 1, torsoTop + torsoH * 0.75, t.deep, 1);
  for (const s of [-1, 1]) {
    pc.px(cx + s * torsoW * 0.3, torsoTop + torsoH * 0.4, v.accent);
    pc.px(cx + s * torsoW * 0.25, torsoTop + torsoH * 0.75, v.accent);
  }
  walkLegs(pc, cx, torsoTop + torsoH - 1, size * ENEMY_GROUND_FRAC, size * 0.19, size * 0.16, t, frame);
  // brow ridge + narrow glowing eye slits (deep-set, armored head)
  pc.rect(cx - size * 0.1, torsoTop - size * 0.02, size * 0.2, 2, t.deep);
  dotEyes(pc, cx, torsoTop + size * 0.03, size * 0.09, 1, v.eye, v.accent);
}

function drawSkitterwing(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const wt = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.4) });
  const cx = size / 2;
  const flap = frame === 1;
  const bodyCy = size * 0.46 + (flap ? 1 : 0);
  flightShadow(pc, cx, size * ENEMY_GROUND_FRAC, size * 0.14);
  // wings: angular membrane blades, tips rise/fall between frames
  for (const s of [-1, 1]) {
    const rootX = cx + s * size * 0.09;
    const rootY = bodyCy - size * 0.02;
    const tipX = cx + s * size * 0.42;
    const tipY = flap ? bodyCy - size * 0.28 : bodyCy + size * 0.08;
    const midX = cx + s * size * 0.24;
    const midY = flap ? bodyCy - size * 0.05 : bodyCy + size * 0.2;
    triangle(pc, rootX, rootY, tipX, tipY, midX, midY, wt.base);
    triangle(pc, rootX, rootY, tipX, tipY, cx + s * size * 0.2, rootY + size * 0.05, wt.sh);
    line(pc, rootX, rootY, tipX, tipY, wt.deep, 1);
  }
  shadedEllipse(pc, cx, bodyCy, size * 0.11, size * 0.16, t);
  shadedCircle(pc, cx, size * 0.28 + (flap ? 1 : 0), size * 0.09, t);
  line(pc, cx - size * 0.05, size * 0.21, cx - size * 0.11, size * 0.13, t.deep, 1);
  line(pc, cx + size * 0.05, size * 0.21, cx + size * 0.11, size * 0.13, t.deep, 1);
  // thin dangling talons
  pc.rect(cx - size * 0.05, bodyCy + size * 0.14, 1, size * 0.06, t.deep);
  pc.rect(cx + size * 0.05, bodyCy + size * 0.14, 1, size * 0.06, t.deep);
  dotEyes(pc, cx, size * 0.28 + (flap ? 1 : 0), size * 0.07, 1, v.eye, v.accent);
}

function drawVoltling(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.3) });
  const cx = size / 2;
  const jitter = frame === 1 ? 1 : -1;
  // deliberately the smallest silhouette in the roster (leaves real empty
  // margin in the frame) — it's a tiny fast swarmer, not a scaled body
  const cy = size * 0.6;
  const r = size * 0.115;
  const spikes: [number, number][] = [
    [cx, cy - r * 1.9],
    [cx - r * 1.7, cy - r * 0.5],
    [cx + r * 1.7, cy - r * 0.5],
    [cx - r * 1.3, cy + r * 1.2],
    [cx + r * 1.3, cy + r * 1.2],
  ];
  for (const [sx, sy] of spikes) {
    spike(pc, cx + (sx - cx) * 0.35, cy + (sy - cy) * 0.35, sx + jitter, sy, size * 0.04, at);
  }
  shadedCircle(pc, cx, cy, r, t);
  pc.px(cx, cy - 1, at.shine);
  walkLegs(pc, cx, cy + r * 0.7, size * ENEMY_GROUND_FRAC, size * 0.07, size * 0.055, t, frame);
  dotEyes(pc, cx, cy, size * 0.065, 1, v.eye);
}

function drawFrostfang(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.25) });
  const cx = size / 2;
  const bob = frame === 1 ? 1 : 0;
  const bodyCy = size * 0.54 + bob;
  const headCy = size * 0.33 + bob;
  shadedEllipse(pc, cx, bodyCy, size * 0.21, size * 0.18, t);
  // ice-shard mohawk down the spine
  spike(pc, cx, headCy - size * 0.1, cx, headCy - size * 0.28, size * 0.06, at);
  spike(pc, cx - size * 0.09, bodyCy - size * 0.14, cx - size * 0.13, bodyCy - size * 0.3, size * 0.05, at);
  spike(pc, cx + size * 0.09, bodyCy - size * 0.14, cx + size * 0.13, bodyCy - size * 0.3, size * 0.05, at);
  shadedCircle(pc, cx, headCy, size * 0.14, t);
  // pointed ears
  spike(pc, cx - size * 0.09, headCy - size * 0.08, cx - size * 0.15, headCy - size * 0.2, size * 0.05, t);
  spike(pc, cx + size * 0.09, headCy - size * 0.08, cx + size * 0.15, headCy - size * 0.2, size * 0.05, t);
  // snout + fang
  pc.rect(cx - size * 0.05, headCy + size * 0.06, size * 0.1, size * 0.05, t.sh);
  triangle(pc, cx - size * 0.02, headCy + size * 0.11, cx + size * 0.02, headCy + size * 0.11, cx, headCy + size * 0.17, "#ffffff");
  walkLegs(pc, cx, size * 0.66 + bob, size * ENEMY_GROUND_FRAC, size * 0.11, size * 0.08, t, frame);
  dotEyes(pc, cx, headCy - size * 0.01, size * 0.075, 1, v.eye);
}

function drawCinderling(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.3) });
  const cx = size / 2;
  const flick = frame === 1;
  const bodyCy = size * 0.54 + (flick ? 1 : 0);
  const headCy = size * 0.32 + (flick ? 1 : 0);
  shadedEllipse(pc, cx, bodyCy, size * 0.19, size * 0.17, t);
  shadedCircle(pc, cx, headCy, size * 0.135, t);
  // curved horns
  spike(pc, cx - size * 0.07, headCy - size * 0.09, cx - size * 0.16, headCy - size * 0.2, size * 0.045, t);
  spike(pc, cx + size * 0.07, headCy - size * 0.09, cx + size * 0.16, headCy - size * 0.2, size * 0.045, t);
  // flame tuft, taller/leaning in frame 1 to read as flicker
  spike(pc, cx, headCy - size * 0.11, cx + (flick ? size * 0.05 : -size * 0.02), headCy - (flick ? size * 0.34 : size * 0.28), size * 0.07, at);
  // tail
  spike(pc, cx + size * 0.14, bodyCy + size * 0.12, cx + size * 0.26, bodyCy + size * 0.2, size * 0.045, at);
  walkLegs(pc, cx, size * 0.64 + (flick ? 1 : 0), size * ENEMY_GROUND_FRAC, size * 0.09, size * 0.07, t, frame);
  dotEyes(pc, cx, headCy, size * 0.07, 1, v.eye, v.accent);
}

function drawQuagbrute(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const cx = size / 2;
  const bob = frame === 1 ? 0 : 1;
  const bodyCy = size * 0.5 - bob * 0.3;
  shadedEllipse(pc, cx, bodyCy, size * 0.31, size * 0.26, t);
  shadedCircle(pc, cx, size * 0.3 - bob * 0.3, size * 0.13, t);
  // hide blotches — irregular darker moss patches, not metal plates
  shadedEllipse(pc, cx - size * 0.13, bodyCy + size * 0.05, size * 0.07, size * 0.05, { ...t, base: t.sh, hi: t.base });
  shadedEllipse(pc, cx + size * 0.15, bodyCy - size * 0.06, size * 0.06, size * 0.045, { ...t, base: t.sh, hi: t.base });
  shadedEllipse(pc, cx + size * 0.02, bodyCy + size * 0.13, size * 0.08, size * 0.05, { ...t, base: t.sh, hi: t.base });
  // heavy hanging arms — planted clear of the torso silhouette (not just a
  // sliver poking out) with a blunt fist knuckle, slightly asymmetric for a
  // lumbering read
  const armH = size * 0.3;
  const armW = size * 0.14;
  const lArmX = cx - size * 0.46;
  const rArmX = cx + size * 0.32;
  pc.rect(lArmX, bodyCy - size * 0.04, armW, armH, t.sh);
  pc.rect(rArmX, bodyCy - size * 0.01 + bob * 2, armW, armH - bob * 2, t.base);
  shadedCircle(pc, lArmX + armW / 2, bodyCy - size * 0.04 + armH, size * 0.09, { ...t, hi: t.base });
  shadedCircle(pc, rArmX + armW / 2, bodyCy - size * 0.01 + bob * 2 + armH - bob * 2, size * 0.09, { ...t, hi: t.base });
  walkLegs(pc, cx, size * 0.68 - bob * 0.3, size * ENEMY_GROUND_FRAC, size * 0.17, size * 0.14, t, frame);
  // heavy angry brow
  pc.rect(cx - size * 0.1, size * 0.26 - bob * 0.3, size * 0.2, 2, t.deep);
  dotEyes(pc, cx, size * 0.31 - bob * 0.3, size * 0.08, 1, v.eye);
}

function drawSandveil(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.35) });
  const cx = size / 2;
  const groundY = size * ENEMY_GROUND_FRAC;
  const rise = frame === 1 ? 1 : 0;
  const headCy = size * 0.44 - rise;
  const bodyCy = size * 0.6 - rise;
  // eye-stalks first (behind mound edge visually is fine, mound painted after)
  for (const s of [-1, 1]) {
    line(pc, cx + s * size * 0.1, headCy - size * 0.06, cx + s * size * 0.13, headCy - size * 0.18, t.sh, 1);
    shadedCircle(pc, cx + s * size * 0.13, headCy - size * 0.19, size * 0.035, at);
  }
  shadedEllipse(pc, cx, bodyCy, size * 0.19, size * 0.16, t);
  shadedCircle(pc, cx, headCy, size * 0.14, t);
  dotEyes(pc, cx, headCy - size * 0.01, size * 0.07, 1, v.eye);
  // dirt mound buries the lower half — no legs, reads as still-burrowing
  mound(pc, cx, size * 0.6 - rise, groundY, size * 0.26, t);
}

function drawWraithguard(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.35) });
  const cx = size / 2;
  const flap = frame === 1;
  const bodyCy = size * 0.5 + (flap ? 1 : 0);
  flightShadow(pc, cx, size * ENEMY_GROUND_FRAC, size * 0.18);
  for (const s of [-1, 1]) {
    const rootX = cx + s * size * 0.14;
    const rootY = bodyCy - size * 0.06;
    const tipX = cx + s * size * 0.46;
    const tipY = flap ? bodyCy - size * 0.22 : bodyCy + size * 0.14;
    const topX = cx + s * size * 0.3;
    const topY = flap ? bodyCy - size * 0.32 : bodyCy - size * 0.1;
    const botX = cx + s * size * 0.28;
    const botY = flap ? bodyCy + size * 0.02 : bodyCy + size * 0.26;
    triangle(pc, rootX, rootY, tipX, tipY, topX, topY, at.base);
    triangle(pc, rootX, rootY, tipX, tipY, botX, botY, at.sh);
    line(pc, rootX, rootY, tipX, tipY, at.deep, 1);
    line(pc, (rootX + topX) / 2, (rootY + topY) / 2, (tipX + botX) / 2, (tipY + botY) / 2, at.deep, 1);
  }
  // hard-edged breastplate (blocky, not round) — the tell that this flyer
  // is armored rather than a light glass-cannon bug like skitterwing
  shadedRect(pc, cx - size * 0.17, bodyCy - size * 0.2, size * 0.34, size * 0.4, t);
  // pauldrons overhang the shoulders
  shadedCircle(pc, cx - size * 0.17, bodyCy - size * 0.15, size * 0.08, t);
  shadedCircle(pc, cx + size * 0.17, bodyCy - size * 0.15, size * 0.08, t);
  line(pc, cx - size * 0.15, bodyCy - size * 0.02, cx + size * 0.15, bodyCy - size * 0.02, t.deep, 1);
  line(pc, cx - size * 0.13, bodyCy + size * 0.1, cx + size * 0.13, bodyCy + size * 0.1, t.deep, 1);
  for (const s of [-1, 1]) pc.px(cx + s * size * 0.12, bodyCy - size * 0.02, v.accent);
  // helm with glowing visor slit
  shadedCircle(pc, cx, size * 0.28 + (flap ? 1 : 0), size * 0.13, t);
  pc.rect(cx - size * 0.08, size * 0.28 + (flap ? 1 : 0), size * 0.16, 2, v.accent);
  // cape/tassets hanging below
  triangle(pc, cx - size * 0.13, bodyCy + size * 0.19, cx + size * 0.13, bodyCy + size * 0.19, cx, bodyCy + size * 0.34, t.deep);
}

function drawRuneshell(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const cx = size / 2;
  const bob = frame === 1 ? 1 : 0;
  const shellCy = size * 0.44 + bob;
  const shellRx = size * 0.33;
  const shellRy = size * 0.2;
  // rim ring drawn slightly larger & darker first so a lip of shadow shows
  // all the way round the dome — the "hard armored carapace" edge tell
  shadedEllipse(pc, cx, shellCy + 1, shellRx + 1, shellRy + 1, { ...t, base: t.sh, hi: t.sh });
  shadedEllipse(pc, cx, shellCy, shellRx, shellRy, t);
  // radial shell seams
  for (const s of [-1.4, -0.6, 0.6, 1.4]) {
    line(pc, cx, shellCy - shellRy * 0.75, cx + s * shellRx * 0.4, shellCy + shellRy * 0.8, t.deep, 1);
  }
  // four elemental rune marks (fire / earth+nature / ice) — flavor-accurate
  // regardless of the accent field, since Runeshell is explicitly four-warded.
  // Drawn as 2x2 glowing glyphs near the shell's rim so they stay legible.
  const runeColors = ["#ff8a3d", "#8fce5c", "#5cc2ce", "#c9a8ff"];
  const runePos: [number, number][] = [
    [cx - shellRx * 0.62, shellCy + shellRy * 0.15],
    [cx - shellRx * 0.22, shellCy - shellRy * 0.55],
    [cx + shellRx * 0.28, shellCy - shellRy * 0.55],
    [cx + shellRx * 0.64, shellCy + shellRy * 0.15],
  ];
  for (let i = 0; i < 4; i++) {
    const [rx, ry] = runePos[i];
    pc.rect(rx - 0.5, ry - 0.5, 2, 2, runeColors[i]);
  }
  const headCy = size * 0.68 + bob;
  shadedCircle(pc, cx, headCy, size * 0.13, t);
  dotEyes(pc, cx, headCy, size * 0.08, 1, v.eye);
  walkLegs(pc, cx, headCy + size * 0.09, size * ENEMY_GROUND_FRAC, size * 0.17, size * 0.12, t, frame);
}

// --- Bosses: bigger, structurally elaborate, more spikes/layers/plates. ---

function drawCindercolossus(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.3) });
  const cx = size / 2;
  const bob = frame === 1 ? 1 : 0;
  const bodyCy = size * 0.54 + bob;
  const headCy = size * 0.32 + bob;
  // crown of jagged molten rock spikes
  const spikeCount = 7;
  for (let i = 0; i < spikeCount; i++) {
    const f = i / (spikeCount - 1);
    const ang = -Math.PI * 0.92 + f * Math.PI * 0.84;
    const baseX = cx + Math.cos(ang) * size * 0.24;
    const baseY = headCy + Math.sin(ang) * size * 0.2;
    const h = i === Math.floor(spikeCount / 2) ? size * 0.26 : size * 0.16 + (i % 2) * size * 0.04;
    spike(pc, baseX, baseY, cx + Math.cos(ang) * size * 0.24, baseY - h, size * 0.06, t);
  }
  shadedEllipse(pc, cx, bodyCy, size * 0.33, size * 0.29, t);
  shadedCircle(pc, cx, headCy, size * 0.17, t);
  // glowing lava cracks across torso
  line(pc, cx - size * 0.2, bodyCy - size * 0.1, cx - size * 0.04, bodyCy + size * 0.08, at.base, 1);
  line(pc, cx + size * 0.05, bodyCy - size * 0.14, cx + size * 0.18, bodyCy + size * 0.02, at.base, 1);
  line(pc, cx - size * 0.02, bodyCy + size * 0.1, cx + size * 0.1, bodyCy + size * 0.2, at.base, 1);
  // huge fists with glowing knuckles
  const armSwing = frame === 1 ? size * 0.03 : -size * 0.03;
  pc.rect(cx - size * 0.42, bodyCy - size * 0.02 + armSwing, size * 0.15, size * 0.32, t.sh);
  pc.rect(cx + size * 0.27, bodyCy - size * 0.02 - armSwing, size * 0.15, size * 0.32, t.base);
  for (const s of [-1, 1]) {
    pc.px(cx + s * size * 0.35, bodyCy + size * 0.28 + (s < 0 ? armSwing : -armSwing), at.base);
    pc.px(cx + s * size * 0.35 + s, bodyCy + size * 0.28 + (s < 0 ? armSwing : -armSwing), at.base);
  }
  walkLegs(pc, cx, size * 0.72 + bob, size * ENEMY_GROUND_FRAC, size * 0.22, size * 0.17, t, frame);
  // ember particles drifting near the base
  pc.px(cx - size * 0.3, size * ENEMY_GROUND_FRAC - size * 0.06 - bob, at.hi);
  pc.px(cx + size * 0.32, size * ENEMY_GROUND_FRAC - size * 0.1 + bob, at.hi);
  dotEyes(pc, cx, headCy, size * 0.08, 2, v.eye, at.base);
}

function drawHollowglacier(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.2) });
  const cx = size / 2;
  const flap = frame === 1;
  const bodyCy = size * 0.46 + (flap ? 1 : 0);
  flightShadow(pc, cx, size * ENEMY_GROUND_FRAC, size * 0.26);
  // large layered crystalline wings, two shards per side
  for (const s of [-1, 1]) {
    for (let layer = 0; layer < 2; layer++) {
      const len = size * (0.5 - layer * 0.12);
      const rootX = cx + s * size * (0.12 + layer * 0.03);
      const rootY = bodyCy - size * 0.04 + layer * size * 0.06;
      const tipX = cx + s * len;
      const tipY = flap ? bodyCy - size * (0.3 - layer * 0.06) : bodyCy + size * (0.1 - layer * 0.03);
      const topX = cx + s * len * 0.55;
      const topY = tipY - size * 0.1;
      triangle(pc, rootX, rootY, tipX, tipY, topX, topY, layer === 0 ? at.base : at.hi);
      line(pc, rootX, rootY, tipX, tipY, at.deep, 1);
    }
  }
  shadedEllipse(pc, cx, bodyCy, size * 0.27, size * 0.25, t);
  // hollow glowing chest core — a dark void ring around a bright pinprick
  // center so it actually reads as "hollow", not just another highlight
  shadedCircle(pc, cx, bodyCy + size * 0.04, size * 0.1, { ...t, hi: t.deep, base: t.deep, sh: t.deep, deep: t.deep });
  pc.rect(cx - 1, bodyCy + size * 0.04 - 1, 3, 3, at.hi);
  pc.px(cx, bodyCy + size * 0.04, "#ffffff");
  // icicle crown
  for (const s of [-2, -1, 0, 1, 2]) {
    const bx = cx + s * size * 0.06;
    const h = size * (0.14 - Math.abs(s) * 0.02);
    spike(pc, bx, size * 0.24 - (flap ? 1 : 0), bx + s * size * 0.01, size * 0.24 - h - (flap ? 1 : 0), size * 0.045, at);
  }
  shadedCircle(pc, cx, size * 0.28 - (flap ? 1 : 0), size * 0.13, t);
  // tapering icy wisps instead of legs — hang clear below the body so the
  // "hollow, barely tethered to the ground" silhouette actually reads
  spike(pc, cx - size * 0.09, bodyCy + size * 0.24, cx - size * 0.17, size * ENEMY_GROUND_FRAC - 1, size * 0.06, t);
  spike(pc, cx + size * 0.09, bodyCy + size * 0.24, cx + size * 0.17, size * ENEMY_GROUND_FRAC - 1, size * 0.06, t);
  dotEyes(pc, cx, size * 0.28 - (flap ? 1 : 0), size * 0.09, 2, v.eye, at.hi);
}

function drawStormsovereign(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual) {
  const t = makeTones(v);
  const at: Tones = makeTones({ ...v, body: v.accent, bodyDark: darken(v.accent, 0.3) });
  const gold = makeTones({ body: v.eye, bodyDark: darken(v.eye, 0.4), accent: v.eye, eye: v.eye });
  const cx = size / 2;
  const flap = frame === 1;
  const bodyCy = size * 0.46 + (flap ? 1 : 0);
  flightShadow(pc, cx, size * ENEMY_GROUND_FRAC, size * 0.26);
  // grand feathered fan wings, 3 layers each side
  for (const s of [-1, 1]) {
    for (let layer = 0; layer < 3; layer++) {
      const f = layer / 2;
      const len = size * (0.52 - f * 0.16);
      const rootX = cx + s * size * 0.13;
      const rootY = bodyCy - size * 0.08 + f * size * 0.1;
      const ang = (flap ? -0.55 : -0.2) + f * 0.34;
      const tipX = rootX + s * Math.cos(ang) * len;
      const tipY = rootY - Math.sin(ang + 0.4) * len;
      const topX = rootX + s * len * 0.4;
      const topY = tipY - size * 0.08;
      triangle(pc, rootX, rootY, tipX, tipY, topX, topY, layer === 0 ? at.sh : layer === 1 ? at.base : at.hi);
      line(pc, rootX, rootY, tipX, tipY, at.deep, 1);
    }
  }
  // flowing cape/train (kept short of a full point so the body still reads
  // as a rounded torso rather than the whole silhouette becoming a diamond)
  triangle(pc, cx - size * 0.18, bodyCy + size * 0.16, cx + size * 0.18, bodyCy + size * 0.16, cx - size * 0.03, bodyCy + size * 0.3, t.deep);
  triangle(pc, cx - size * 0.18, bodyCy + size * 0.16, cx + size * 0.03, bodyCy + size * 0.16, cx + size * 0.14, bodyCy + size * 0.32, t.sh);
  shadedEllipse(pc, cx, bodyCy, size * 0.28, size * 0.26, t);
  // lightning-bolt crown
  const crownBaseY = size * 0.24 - (flap ? 1 : 0);
  line(pc, cx - size * 0.12, crownBaseY, cx - size * 0.05, crownBaseY - size * 0.16, gold.base, 1);
  line(pc, cx - size * 0.05, crownBaseY - size * 0.16, cx - size * 0.11, crownBaseY - size * 0.2, gold.base, 1);
  line(pc, cx - size * 0.11, crownBaseY - size * 0.2, cx - size * 0.02, crownBaseY - size * 0.34, gold.base, 1);
  line(pc, cx + size * 0.12, crownBaseY, cx + size * 0.05, crownBaseY - size * 0.16, gold.base, 1);
  line(pc, cx + size * 0.05, crownBaseY - size * 0.16, cx + size * 0.11, crownBaseY - size * 0.2, gold.base, 1);
  line(pc, cx + size * 0.11, crownBaseY - size * 0.2, cx + size * 0.02, crownBaseY - size * 0.34, gold.base, 1);
  spike(pc, cx, crownBaseY - size * 0.02, cx, crownBaseY - size * 0.3, size * 0.05, gold);
  shadedCircle(pc, cx, size * 0.28 - (flap ? 1 : 0), size * 0.14, t);
  // orbiting lightning motes, drift between frames
  const motePhase = flap ? 1 : 0;
  pc.px(cx - size * 0.38 + motePhase, bodyCy - size * 0.08, gold.base);
  pc.px(cx + size * 0.4 - motePhase, bodyCy + size * 0.14, gold.base);
  pc.px(cx - size * 0.02, bodyCy - size * 0.32 - motePhase, gold.base);
  dotEyes(pc, cx, size * 0.28 - (flap ? 1 : 0), size * 0.09, 2, v.eye, t.sh);
}

const DRAWERS: Record<string, Drawer> = {
  thornling: drawThornling,
  cragback: drawCragback,
  skitterwing: drawSkitterwing,
  voltling: drawVoltling,
  frostfang: drawFrostfang,
  cinderling: drawCinderling,
  quagbrute: drawQuagbrute,
  sandveil: drawSandveil,
  wraithguard: drawWraithguard,
  runeshell: drawRuneshell,
  cindercolossus: drawCindercolossus,
  hollowglacier: drawHollowglacier,
  stormsovereign: drawStormsovereign,
};

/** Fallback silhouette for any enemy id not covered above (future-proofing —
 * every current roster entry has a bespoke drawer). Still respects
 * movement kind so a brand-new enemy wouldn't render as a bare blob. */
function drawFallback(pc: PixelCanvas, size: number, frame: 0 | 1, v: EnemyVisual, def: EnemyDef) {
  const t = makeTones(v);
  const cx = size / 2;
  const bob = frame === 1 ? 1 : 0;
  const bodyCy = size * 0.53 + bob;
  if (def.movement === "flying") {
    flightShadow(pc, cx, size * ENEMY_GROUND_FRAC, size * 0.16);
    for (const s of [-1, 1]) triangle(pc, cx + s * size * 0.1, bodyCy, cx + s * size * 0.38, bodyCy - size * 0.14, cx + s * size * 0.24, bodyCy + size * 0.1, t.base);
  }
  shadedEllipse(pc, cx, bodyCy, size * 0.2, size * 0.18, t);
  shadedCircle(pc, cx, size * 0.32 + bob, size * 0.13, t);
  if (def.movement === "burrowing") mound(pc, cx, size * 0.58, size * ENEMY_GROUND_FRAC, size * 0.24, t);
  else if (def.movement === "ground") walkLegs(pc, cx, size * 0.66 + bob, size * ENEMY_GROUND_FRAC, size * 0.1, size * 0.08, t, frame);
  dotEyes(pc, cx, size * 0.32 + bob, size * 0.075, 1, v.eye);
}

/** Procedural pixel-art enemy sprite. `frame` (0/1) drives a 2-frame
 * walk/flap cycle — a real weight-shift/wing-flap per archetype, not just a
 * 1px jitter. Bosses (`def.isBoss`) get their own larger, structurally more
 * elaborate drawers (crowns, layered wings, plating) rather than a scaled
 * copy of a regular grunt. */
export function getEnemySprite(def: EnemyDef, frame: 0 | 1 = 0): HTMLCanvasElement {
  const key = `${def.id}:${frame}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const v = VISUALS[def.id] ?? FALLBACK;
  const size = def.isBoss ? BOSS_SPRITE_SIZE : ENEMY_SPRITE_SIZE;
  const pc = new PixelCanvas(size);

  const drawer = DRAWERS[def.id];
  if (drawer) drawer(pc, size, frame, v);
  else drawFallback(pc, size, frame, v, def);

  pc.outline("#0d0912");
  const img = pc.toImage();
  cache.set(key, img);
  return img;
}
