import type { EnemyDef, EnemyMovementKind } from "@/game/types";
import { PixelCanvas } from "./PixelCanvas";

export const ENEMY_SPRITE_SIZE = 22;
export const BOSS_SPRITE_SIZE = 40;
/** Fraction down from the sprite's top that represents "ground contact" —
 * Game.ts anchors the drawn sprite here so it visually stands on its tile
 * instead of floating centered on it. Keep in sync with where drawBody()
 * actually plants the creature's feet/base. */
export const ENEMY_GROUND_FRAC = 0.62;

interface EnemyVisual {
  body: string;
  bodyDark: string;
  accent: string;
  eye: string;
}

// Thematic per-enemy palette — hand-picked so each of the 13 regular/boss
// silhouettes reads as "that" creature at a glance (embers for cinderling,
// icy white for frostfang, storm purple for the flying boss...) rather than
// a hashed/randomized color that wouldn't stay consistent with the roster's
// established identity from the old 3D models.
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

function drawBody(pc: PixelCanvas, cx: number, cy: number, r: number, v: EnemyVisual, movement: EnemyMovementKind) {
  pc.circle(cx, cy, r, v.bodyDark);
  pc.circle(cx, cy - 1, r - 1, v.body);
  pc.circle(cx - Math.round(r * 0.3), cy - Math.round(r * 0.3), Math.max(1, r - 3), v.accent);

  if (movement === "flying") {
    pc.rect(cx - r - 3, cy - 1, 3, 2, v.accent);
    pc.rect(cx + r, cy - 1, 3, 2, v.accent);
  } else if (movement === "ground") {
    pc.rect(cx - Math.round(r * 0.5), cy + r - 1, 2, 3, v.bodyDark);
    pc.rect(cx + Math.round(r * 0.5) - 2, cy + r - 1, 2, 3, v.bodyDark);
  } else {
    // burrowing: body fades into a dust-ring base instead of visible legs
    pc.circle(cx, cy + r - 1, Math.max(2, r - 1), v.bodyDark);
  }

  // eyes
  pc.px(cx - Math.round(r * 0.35), cy - 1, v.eye);
  pc.px(cx + Math.round(r * 0.35), cy - 1, v.eye);
}

/** Procedural pixel-art enemy sprite. `frame` (0/1) drives a tiny bob/limb
 * offset for a 2-frame walk cycle — cheap but effective at this pixel
 * density, same trick classic 16/32-bit sprite sheets use. */
export function getEnemySprite(def: EnemyDef, frame: 0 | 1 = 0): HTMLCanvasElement {
  const key = `${def.id}:${frame}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const v = VISUALS[def.id] ?? FALLBACK;
  const size = def.isBoss ? BOSS_SPRITE_SIZE : ENEMY_SPRITE_SIZE;
  const pc = new PixelCanvas(size);
  const cx = size / 2;
  const cy = size / 2 + (frame === 1 ? 1 : 0);
  const r = def.isBoss ? Math.round(size * 0.34) : Math.round(size * 0.32);

  drawBody(pc, cx, cy, r, v, def.movement);

  if (def.isBoss) {
    // crown of spikes to read unmistakably as a boss silhouette
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI - Math.PI / 2 - Math.PI / 6;
      const px = cx + Math.cos(ang) * (r + 2);
      const py = cy - r + Math.sin(ang) * (r * 0.6);
      pc.px(px, py - 1, v.accent);
    }
  }
  if (def.armor >= 10) {
    // visible plating flecks for heavily-armored units
    pc.px(cx - r + 2, cy, v.bodyDark);
    pc.px(cx + r - 2, cy, v.bodyDark);
  }

  pc.outline("#100a18");
  const img = pc.toImage();
  cache.set(key, img);
  return img;
}
