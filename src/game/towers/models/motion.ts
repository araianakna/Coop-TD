import * as THREE from "three";

interface MotionData {
  baseY: number;
  baseRotY: number;
  spinSpeed: number; // radians/sec
  bobAmp: number;
  bobSpeed: number;
  bobPhase: number;
}

export interface MotionOptions {
  spinSpeed?: number;
  bobAmp?: number;
  bobSpeed?: number;
  bobPhase?: number;
}

/**
 * Tags an object with idle motion (slow spin and/or gentle bob) that
 * `animateTowerModel` applies each frame. Purely cosmetic "implied power"
 * flourish for floating shards/rings/orbs — structural parts should not
 * get this.
 */
export function applyMotion(obj: THREE.Object3D, opts: MotionOptions) {
  const data: MotionData = {
    baseY: obj.position.y,
    baseRotY: obj.rotation.y,
    spinSpeed: opts.spinSpeed ?? 0,
    bobAmp: opts.bobAmp ?? 0,
    bobSpeed: opts.bobSpeed ?? 1,
    bobPhase: opts.bobPhase ?? Math.random() * Math.PI * 2,
  };
  obj.userData.motion = data;
}

/** Recursively advance every motion-tagged descendant of `root` to `elapsedSeconds`. */
export function animateTowerModel(root: THREE.Object3D, elapsedSeconds: number) {
  root.traverse((obj) => {
    const m = obj.userData.motion as MotionData | undefined;
    if (!m) return;
    if (m.spinSpeed) obj.rotation.y = m.baseRotY + elapsedSeconds * m.spinSpeed;
    if (m.bobAmp) obj.position.y = m.baseY + Math.sin(elapsedSeconds * m.bobSpeed + m.bobPhase) * m.bobAmp;
  });
}
