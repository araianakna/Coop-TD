/**
 * Top-down 2D camera: pans/zooms over the world's (x, z) plane (the same
 * coordinate pair Grid.gridToWorld already returns — world z maps straight
 * onto 2D screen-space "down" here, no reinterpretation needed elsewhere).
 *
 * Desktop: right-mouse-drag pans, wheel zooms.
 * Touch: one-finger drag pans (grab-the-world convention), two-finger pinch
 * zooms. The canvas is styled `touch-action: none` (see Renderer2D) so the
 * browser never intercepts these gestures for its own scroll/zoom — and
 * since none of the touch handlers below call preventDefault(), a
 * stationary tap still synthesizes a normal `click` event for tower
 * placement/selection to pick up (same convention the old 3D
 * RtsCameraController used).
 */
export class TopDownCamera2D {
  /** World-space point centered on screen. */
  target = { x: 0, y: 0 };
  /** Screen pixels per world unit. */
  zoom = 30;
  minZoom = 16;
  maxZoom = 64;

  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };

  private touches = new Map<number, { x: number; y: number }>();
  private lastPanPoint: { x: number; y: number } | null = null;
  private lastPinchDist: number | null = null;

  constructor(el: HTMLElement) {
    this.bind(el);
  }

  private bind(el: HTMLElement) {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (e.button === 2 || e.button === 0) {
        this.isDragging = e.button === 2;
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener("pointerup", () => {
      this.isDragging = false;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.target.x -= dx / this.zoom;
      this.target.y -= dy / this.zoom;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = clamp(this.zoom - e.deltaY * 0.04, this.minZoom, this.maxZoom);
      },
      { passive: false },
    );

    el.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: true });
    el.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: true });
    el.addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: true });
    el.addEventListener("touchcancel", (e) => this.onTouchEnd(e), { passive: true });
  }

  private onTouchStart(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      // Touches landing on an interactive UI panel must not also pan the
      // camera underneath (see Camera.ts's original 3D fix for the same
      // "swiping the shop strip drags the world" bug).
      if (t.target instanceof Element && t.target.closest("#rw-ui-root")) continue;
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    this.lastPanPoint = null;
    this.lastPinchDist = null;
    if (this.touches.size === 1) {
      this.lastPanPoint = { ...this.touches.values().next().value! };
    } else if (this.touches.size === 2) {
      const [a, b] = Array.from(this.touches.values());
      this.lastPinchDist = Math.hypot(b.x - a.x, b.y - a.y);
    }
  }

  private onTouchMove(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      if (this.touches.has(t.identifier)) this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (this.touches.size === 1 && this.lastPanPoint) {
      const only = this.touches.values().next().value!;
      const dx = only.x - this.lastPanPoint.x;
      const dy = only.y - this.lastPanPoint.y;
      this.lastPanPoint = { ...only };
      this.target.x -= dx / this.zoom;
      this.target.y -= dy / this.zoom;
    } else if (this.touches.size === 2) {
      const [a, b] = Array.from(this.touches.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (this.lastPinchDist !== null) {
        this.zoom = clamp(this.zoom + (dist - this.lastPinchDist) * 0.12, this.minZoom, this.maxZoom);
      }
      this.lastPinchDist = dist;
    }
  }

  private onTouchEnd(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) this.touches.delete(t.identifier);
    this.lastPanPoint = null;
    this.lastPinchDist = null;
    if (this.touches.size === 1) this.lastPanPoint = { ...this.touches.values().next().value! };
  }

  worldToScreen(wx: number, wy: number, viewportW: number, viewportH: number): [number, number] {
    return [viewportW / 2 + (wx - this.target.x) * this.zoom, viewportH / 2 + (wy - this.target.y) * this.zoom];
  }

  screenToWorld(sx: number, sy: number, viewportW: number, viewportH: number): [number, number] {
    return [(sx - viewportW / 2) / this.zoom + this.target.x, (sy - viewportH / 2) / this.zoom + this.target.y];
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
