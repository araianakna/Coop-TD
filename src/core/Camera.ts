import * as THREE from "three";

/**
 * RTS-style camera: orbits/pans around a focus point, zoom via wheel,
 * rotate via right-mouse-drag, pan via WASD/edge-drag.
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
