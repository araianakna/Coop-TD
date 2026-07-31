// Plain Canvas2D renderer for the top-down pixel-art view. Replaces the old
// Three.js WebGL renderer entirely — no scene graph, no shaders; Game.ts
// draws directly into the returned 2D context every frame.
//
// Pixel-art crispness comes from two things working together:
//   1. `imageSmoothingEnabled = false` on the context, so any drawImage()
//      of a small sprite scales up with hard nearest-neighbor edges instead
//      of blurring.
//   2. `image-rendering: pixelated` on the canvas element itself, so the
//      browser's own CSS-size upscale (canvas backing store vs its display
//      size) stays crisp too.
export interface Renderer2DBundle {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  resize: (w: number, h: number) => void;
  width: number;
  height: number;
}

export function createRenderer2D(canvasHost: HTMLElement): Renderer2DBundle {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  // Hand touch gestures entirely to our own pan/pinch handlers (Camera2D)
  // instead of the browser's native scroll/zoom.
  canvas.style.touchAction = "none";
  (canvas.style as CSSStyleDeclaration & { imageRendering: string }).imageRendering = "pixelated";
  canvasHost.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.imageSmoothingEnabled = false;

  const bundle: Renderer2DBundle = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    resize(w: number, h: number) {
      const isCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const dpr = Math.min(window.devicePixelRatio || 1, isCoarsePointer ? 1.5 : 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      bundle.width = w;
      bundle.height = h;
    },
  };
  return bundle;
}
