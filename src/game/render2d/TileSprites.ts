import type { CellKind } from "@/game/types";
import { PixelCanvas, mulberry32 } from "./PixelCanvas";

export const TILE_SPRITE_SIZE = 16;
const VARIANTS_PER_KIND = 4;

const cache = new Map<string, HTMLCanvasElement>();

function grassTile(variant: number): HTMLCanvasElement {
  const pc = new PixelCanvas(TILE_SPRITE_SIZE);
  pc.rect(0, 0, TILE_SPRITE_SIZE, TILE_SPRITE_SIZE, "#2e5a2e");
  const rng = mulberry32(1000 + variant);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * TILE_SPRITE_SIZE);
    const y = Math.floor(rng() * TILE_SPRITE_SIZE);
    pc.px(x, y, rng() > 0.5 ? "#3d6f38" : "#255024");
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rng() * TILE_SPRITE_SIZE);
    const y = Math.floor(rng() * TILE_SPRITE_SIZE);
    pc.px(x, y, "#5c9a4a");
  }
  return pc.toImage();
}

function pathTile(variant: number): HTMLCanvasElement {
  const pc = new PixelCanvas(TILE_SPRITE_SIZE);
  pc.rect(0, 0, TILE_SPRITE_SIZE, TILE_SPRITE_SIZE, "#5c5468");
  pc.rect(1, 1, TILE_SPRITE_SIZE - 2, TILE_SPRITE_SIZE - 2, "#6e6579");
  const rng = mulberry32(2000 + variant);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * TILE_SPRITE_SIZE);
    const y = Math.floor(rng() * TILE_SPRITE_SIZE);
    pc.px(x, y, rng() > 0.5 ? "#4a4457" : "#7d7489");
  }
  // faint worn center tread, echoing the old 3D path's chevron language
  pc.rect(6, 0, 4, TILE_SPRITE_SIZE, "rgba(180,200,220,0.08)");
  return pc.toImage();
}

function blockedTile(variant: number): HTMLCanvasElement {
  const pc = new PixelCanvas(TILE_SPRITE_SIZE);
  pc.rect(0, 0, TILE_SPRITE_SIZE, TILE_SPRITE_SIZE, "#241c30");
  const rng = mulberry32(3000 + variant);
  pc.circle(8, 8, 6, "#4a3f57");
  pc.circle(6, 6, 3, "#5c5068");
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * TILE_SPRITE_SIZE);
    const y = Math.floor(rng() * TILE_SPRITE_SIZE);
    pc.px(x, y, "#2f2640");
  }
  return pc.toImage();
}

function portalTile(kind: "spawn" | "base"): HTMLCanvasElement {
  const pc = new PixelCanvas(TILE_SPRITE_SIZE);
  pc.rect(0, 0, TILE_SPRITE_SIZE, TILE_SPRITE_SIZE, "#241c30");
  const color = kind === "spawn" ? "#e26bff" : "#6bd4ff";
  pc.circle(8, 8, 6, color);
  pc.circle(8, 8, 4, "#241c30");
  pc.circle(8, 8, 2, color);
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
      img = portalTile("spawn");
      break;
    case "base":
      img = portalTile("base");
      break;
    default:
      img = grassTile(v);
  }
  cache.set(key, img);
  return img;
}
