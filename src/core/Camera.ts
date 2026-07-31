import * as THREE from "three";

/**
 * RTS-style camera: orbits/pans around a focus point.
 * Desktop: zoom via wheel, rotate via right-mouse-drag, pan via WASD/arrows.
 * Touch: one-finger drag pans (grab-the-world convention), two-finger
 * pinch zooms, two-finger twist rotates. The canvas is styled
 * `touch-action: none` (see Game.ts) so the browser never intercepts these
 * gestures for its own scroll/zoom — and since none of the touch handlers
 * below call preventDefault(), a stationary tap still synthesizes a normal
 * `click` event for tower placement/selection to pick up.
 */
export class RtsCameraController {
  readonly camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector3(0, 0, 0);
  private distance = 34;
  private minDistance = 14;
  private maxDistance = 60;
  private yaw = 0.12;
  private pitch = 1.02; // radians above horizon
  private minPitch = 0.5;
  private maxPitch = 1.35;

  private isRotating = false;
  private lastPointer = { x: 0, y: 0 };
  private keys = new Set<string>();

  private touches = new Map<number, { x: number; y: number }>();
  private lastPanPoint: { x: number; y: number } | null = null;
  private lastPinchDist: number | null = null;
  private lastPinchAngle: number | null = null;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.bind(domElement);
    this.updateCameraTransform();
  }

  private bind(el: HTMLElement) {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (e.button === 2) {
        this.isRotating = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 2) this.isRotating = false;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.isRotating) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.005;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * 0.004,
        this.minPitch,
        this.maxPitch,
      );
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(
          this.distance + e.deltaY * 0.02,
          this.minDistance,
          this.maxDistance,
        );
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    el.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: true });
    el.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: true });
    el.addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: true });
    el.addEventListener("touchcancel", (e) => this.onTouchEnd(e), { passive: true });
  }

  private onTouchStart(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      // Touches that land on an interactive UI panel (shop strip, inspector,
      // fusion panel...) must not also drive the camera underneath — e.g.
      // swiping the shop list to scroll it would otherwise pan the world at
      // the same time. Those panels sit inside a pointer-events:none overlay
      // that only re-enables hit-testing on the panels themselves, so a
      // touch's target lands inside #rw-ui-root only when it's really over
      // UI; empty overlay area passes through to the canvas as usual.
      if (t.target instanceof Element && t.target.closest("#rw-ui-root")) continue;
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    this.lastPanPoint = null;
    this.lastPinchDist = null;
    this.lastPinchAngle = null;
    if (this.touches.size === 1) {
      const only = this.touches.values().next().value!;
      this.lastPanPoint = { ...only };
    } else if (this.touches.size === 2) {
      const [a, b] = Array.from(this.touches.values());
      this.lastPinchDist = Math.hypot(b.x - a.x, b.y - a.y);
      this.lastPinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
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

      const dragScale = this.distance * 0.0026;
      const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      this.target.addScaledVector(right, -dx * dragScale);
      this.target.addScaledVector(forward, -dy * dragScale);
    } else if (this.touches.size === 2) {
      const [a, b] = Array.from(this.touches.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);

      if (this.lastPinchDist !== null) {
        this.distance = THREE.MathUtils.clamp(
          this.distance - (dist - this.lastPinchDist) * 0.07,
          this.minDistance,
          this.maxDistance,
        );
      }
      if (this.lastPinchAngle !== null) {
        let deltaAngle = angle - this.lastPinchAngle;
        // normalize into [-PI, PI] so the wrap-around at +-PI doesn't spike the rotation
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
        this.yaw -= deltaAngle * 0.85;
      }
      this.lastPinchDist = dist;
      this.lastPinchAngle = angle;
    }
  }

  private onTouchEnd(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) this.touches.delete(t.identifier);
    this.lastPanPoint = null;
    this.lastPinchDist = null;
    this.lastPinchAngle = null;
    if (this.touches.size === 1) {
      const only = this.touches.values().next().value!;
      this.lastPanPoint = { ...only };
    }
  }

  update(dtSeconds: number) {
    const panSpeed = this.distance * 0.9;
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp"))
      this.target.addScaledVector(forward, -panSpeed * dtSeconds);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown"))
      this.target.addScaledVector(forward, panSpeed * dtSeconds);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft"))
      this.target.addScaledVector(right, -panSpeed * dtSeconds);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight"))
      this.target.addScaledVector(right, panSpeed * dtSeconds);
    this.updateCameraTransform();
  }

  private updateCameraTransform() {
    const horizontalRadius = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance;
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * horizontalRadius,
      height,
      Math.cos(this.yaw) * horizontalRadius,
    );
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  setTarget(v: THREE.Vector3) {
    this.target.copy(v);
  }
}

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
  return camera;
}
