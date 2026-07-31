// Shared primitive for procedurally-drawn pixel art: draw onto a small
// logical pixel grid (e.g. 24x24), then rasterize to a real <canvas> at 1
// device pixel per logical pixel — Renderer2D's `imageSmoothingEnabled =
// false` plus CSS `image-rendering: pixelated` do the crisp nearest-neighbor
// upscale when it's later drawn into the game canvas at a larger size.
//
// This keeps every sprite defined as plain pixel-grid data (readable,
// diffable, no external asset files) while still giving full 32-bit RGBA
// color — "pixel art" here means the chunky-pixel *silhouette*, not a
// retro-limited palette.
export class PixelCanvas {
  readonly size: number;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(size: number) {
    this.size = size;
    this.canvas = document.createElement("canvas");
    this.canvas.width = size;
    this.canvas.height = size;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  px(x: number, y: number, color: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 1, 1);
  }

  /** Fills an axis-aligned block of logical pixels (coords rounded — hard
   * 1px edges, no sub-pixel anti-aliasing blur). */
  rect(x: number, y: number, w: number, h: number, color: string) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /** Filled circle in logical pixel space (simple midpoint scan, chunky by design). */
  circle(cx: number, cy: number, r: number, color: string) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.round(r);
    this.ctx.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + 0.2) this.ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }

  /** 1px-thick outline traced just outside any opaque pixel — call last. */
  outline(color: string) {
    const size = this.size;
    const img = this.ctx.getImageData(0, 0, size, size);
    const alphaAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return 0;
      return img.data[(y * size + x) * 4 + 3];
    };
    const toOutline: [number, number][] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (alphaAt(x, y) > 0) continue;
        const neighborOpaque =
          alphaAt(x - 1, y) > 0 || alphaAt(x + 1, y) > 0 || alphaAt(x, y - 1) > 0 || alphaAt(x, y + 1) > 0;
        if (neighborOpaque) toOutline.push([x, y]);
      }
    }
    this.ctx.fillStyle = color;
    for (const [x, y] of toOutline) this.ctx.fillRect(x, y, 1, 1);
  }

  toImage(): HTMLCanvasElement {
    return this.canvas;
  }
}

/** Simple seeded PRNG so sprite variation is deterministic per key (no two
 * calls with the same seed jitter differently frame to frame). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
