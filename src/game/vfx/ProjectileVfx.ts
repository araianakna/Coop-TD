// Per-element projectile visuals: a moving glowing bolt/orb/shard with a
// trailing particle stream, plus a jittered arc line for lightning.
//
// vfx-id convention: use `projectileVfxId(element)` from "@/game/vfx/ids"
// (produces `"vfx.<element>.projectile"`) when wiring TowerDef.projectileVfx
// — VfxManager routes ids of that shape to `ProjectileVfx.spawn`.
//
// Usage:
//   const pv = new ProjectileVfx(scene);
//   pv.spawn("fire", fromWorldPos, () => targetEnemy.mesh.position.toArray(), {
//     speed: 16,
//     onArrive: () => impactVfx.trigger("fire", currentPos),
//   });
//   // each frame:
//   pv.update(dt);
//   // on teardown:
//   pv.dispose();
import * as THREE from "three";
import type { Element } from "@/game/types";
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { ParticleSystem, type ParticleShape } from "@/game/vfx/ParticleSystem";

export interface ProjectileSpawnOptions {
  /** World units/sec. Falls back to a sane per-element default. */
  speed?: number;
  /** Called once when the projectile reaches its target (or after it travels
   * past `maxLifeSeconds` as a safety net if the target getter never closes
   * the distance). Receives the arrival world position. */
  onArrive?: (worldPos: [number, number, number]) => void;
  /** Safety cutoff so a projectile chasing a dead/missing target doesn't
   * live forever. Default 4s. */
  maxLifeSeconds?: number;
}

export interface ProjectileHandle {
  readonly id: number;
  /** Removes the projectile immediately without firing onArrive. */
  cancel(): void;
}

interface ElementProjectileStyle {
  shape: ParticleShape;
  meshFactory: (color: THREE.Color) => THREE.Object3D;
  speed: number;
  trailRate: number;
  trailSize: [number, number];
  trailLifetime: [number, number];
  trailGravity: THREE.Vector3;
  trailTurbulence: number;
  spinSpeed: number;
}

function makeOrb(radius: number, color: THREE.Color, detail = 1): THREE.Object3D {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), toneMapped: false });
  return new THREE.Mesh(geo, mat);
}

function makeShard(size: number, color: THREE.Color): THREE.Object3D {
  const geo = new THREE.OctahedronGeometry(size, 0);
  geo.scale(0.6, 1.6, 0.6);
  const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.4), toneMapped: false });
  return new THREE.Mesh(geo, mat);
}

function makeChunk(size: number, color: THREE.Color): THREE.Object3D {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), toneMapped: false });
  return new THREE.Mesh(geo, mat);
}

const STYLES: Record<Element, ElementProjectileStyle> = {
  fire: {
    shape: "soft",
    meshFactory: (c) => makeOrb(0.14, c, 1),
    speed: 15,
    trailRate: 90,
    trailSize: [0.22, 0.02],
    trailLifetime: [0.18, 0.32],
    trailGravity: new THREE.Vector3(0, 0.6, 0),
    trailTurbulence: 1.2,
    spinSpeed: 2,
  },
  ice: {
    shape: "shard",
    meshFactory: (c) => makeShard(0.16, c),
    speed: 17,
    trailRate: 70,
    trailSize: [0.14, 0.02],
    trailLifetime: [0.16, 0.26],
    trailGravity: new THREE.Vector3(0, -0.15, 0),
    trailTurbulence: 0.2,
    spinSpeed: 6,
  },
  lightning: {
    shape: "spark",
    meshFactory: (c) => makeOrb(0.1, c, 0),
    speed: 30,
    trailRate: 140,
    trailSize: [0.16, 0.02],
    trailLifetime: [0.08, 0.14],
    trailGravity: new THREE.Vector3(0, 0, 0),
    trailTurbulence: 3.5,
    spinSpeed: 0,
  },
  nature: {
    shape: "leaf",
    meshFactory: (c) => makeOrb(0.13, c, 0),
    speed: 12,
    trailRate: 60,
    trailSize: [0.18, 0.03],
    trailLifetime: [0.28, 0.42],
    trailGravity: new THREE.Vector3(0, -0.1, 0),
    trailTurbulence: 0.6,
    spinSpeed: 3,
  },
  earth: {
    shape: "chunk",
    meshFactory: (c) => makeChunk(0.16, c),
    speed: 10,
    trailRate: 50,
    trailSize: [0.16, 0.03],
    trailLifetime: [0.2, 0.32],
    trailGravity: new THREE.Vector3(0, -1.4, 0),
    trailTurbulence: 0.1,
    spinSpeed: 4,
  },
  arcane: {
    shape: "shard",
    meshFactory: (c) => makeOrb(0.13, c, 0),
    speed: 18,
    trailRate: 80,
    trailSize: [0.16, 0.02],
    trailLifetime: [0.22, 0.34],
    trailGravity: new THREE.Vector3(0, 0, 0),
    trailTurbulence: 0.4,
    spinSpeed: 5,
  },
  shadow: {
    shape: "soft",
    meshFactory: (c) => makeOrb(0.13, c, 0),
    speed: 16,
    trailRate: 60,
    trailSize: [0.15, 0.02],
    trailLifetime: [0.26, 0.4],
    trailGravity: new THREE.Vector3(0, -0.1, 0),
    trailTurbulence: 0.3,
    spinSpeed: 2,
  },
};

type TargetSource = [number, number, number] | (() => [number, number, number]);

interface ActiveProjectile {
  id: number;
  element: Element;
  mesh: THREE.Object3D;
  trail: ParticleSystem;
  current: THREE.Vector3;
  targetSource: TargetSource;
  speed: number;
  age: number;
  maxLife: number;
  onArrive?: (worldPos: [number, number, number]) => void;
  spinSpeed: number;
  arcLine?: THREE.Line;
  arcGeometry?: THREE.BufferGeometry;
}

function resolveTarget(source: TargetSource): THREE.Vector3 {
  const arr = typeof source === "function" ? source() : source;
  return new THREE.Vector3(arr[0], arr[1], arr[2]);
}

export class ProjectileVfx {
  private scene: THREE.Scene;
  private active: ActiveProjectile[] = [];
  /** Trails detached from an arrived/cancelled projectile that are still
   * fading out their already-emitted particles; driven by the same
   * update(dt) so they stay correct even if the game is paused/slowed. */
  private fadingTrails: ParticleSystem[] = [];
  private nextId = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(
    element: Element,
    from: [number, number, number],
    target: TargetSource,
    opts?: ProjectileSpawnOptions,
  ): ProjectileHandle {
    const style = STYLES[element];
    const palette = ELEMENT_PALETTES[element];
    const mesh = style.meshFactory(palette.core);
    mesh.position.set(from[0], from[1], from[2]);
    this.scene.add(mesh);

    const trail = new ParticleSystem(this.scene, {
      colorStart: palette.core,
      colorEnd: palette.rim,
      sizeStart: style.trailSize[0],
      sizeEnd: style.trailSize[1],
      lifetime: style.trailLifetime,
      speed: [0.1, 0.6],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI,
      gravity: style.trailGravity,
      drag: 1.5,
      turbulence: style.trailTurbulence,
      shape: style.shape,
      emissionRate: style.trailRate,
      maxParticles: 200,
      intensity: 1.1,
    });
    trail.setEmitting(true);
    trail.setEmitOrigin(from);

    const id = this.nextId++;
    const proj: ActiveProjectile = {
      id,
      element,
      mesh,
      trail,
      current: new THREE.Vector3(from[0], from[1], from[2]),
      targetSource: target,
      speed: opts?.speed ?? style.speed,
      age: 0,
      maxLife: opts?.maxLifeSeconds ?? 4,
      onArrive: opts?.onArrive,
      spinSpeed: style.spinSpeed,
    };

    if (element === "lightning") {
      const arcGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(3 * 3); // 3-point jittered arc
      arcGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const arcMat = new THREE.LineBasicMaterial({
        color: palette.core.clone().multiplyScalar(2.0),
        toneMapped: false,
        transparent: true,
        opacity: 0.85,
      });
      const arcLine = new THREE.Line(arcGeometry, arcMat);
      arcLine.frustumCulled = false;
      this.scene.add(arcLine);
      proj.arcLine = arcLine;
      proj.arcGeometry = arcGeometry;
    }

    this.active.push(proj);

    return {
      id,
      cancel: () => this.remove(proj, false),
    };
  }

  update(dt: number): void {
    for (const proj of [...this.active]) {
      proj.age += dt;
      const targetPos = resolveTarget(proj.targetSource);
      const toTarget = targetPos.clone().sub(proj.current);
      const dist = toTarget.length();
      const step = proj.speed * dt;

      if (dist <= Math.max(step, 0.06) || proj.age >= proj.maxLife) {
        const arrivedAt: [number, number, number] = [targetPos.x, targetPos.y, targetPos.z];
        proj.onArrive?.(arrivedAt);
        this.remove(proj, true);
        continue;
      }

      toTarget.normalize();
      proj.current.addScaledVector(toTarget, step);
      proj.mesh.position.copy(proj.current);
      proj.mesh.rotation.x += proj.spinSpeed * dt;
      proj.mesh.rotation.y += proj.spinSpeed * dt * 0.7;

      proj.trail.setEmitOrigin([proj.current.x, proj.current.y, proj.current.z]);

      if (proj.arcGeometry) {
        const mid = proj.current.clone();
        const jitter = 0.14;
        mid.x += (Math.random() - 0.5) * jitter;
        mid.y += (Math.random() - 0.5) * jitter;
        mid.z += (Math.random() - 0.5) * jitter;
        const posAttr = proj.arcGeometry.attributes.position as THREE.BufferAttribute;
        // trailing point a bit behind current, current, and a jittered lead point
        const behind = proj.current.clone().addScaledVector(toTarget, -0.5);
        posAttr.setXYZ(0, behind.x, behind.y, behind.z);
        posAttr.setXYZ(1, mid.x, mid.y, mid.z);
        posAttr.setXYZ(2, proj.current.x, proj.current.y, proj.current.z);
        posAttr.needsUpdate = true;
      }
    }

    for (const proj of this.active) proj.trail.update(dt);

    for (const trail of [...this.fadingTrails]) {
      trail.update(dt);
      if (!trail.isActive()) {
        trail.dispose();
        this.fadingTrails = this.fadingTrails.filter((t) => t !== trail);
      }
    }
  }

  private remove(proj: ActiveProjectile, keepTrailFading: boolean) {
    this.active = this.active.filter((p) => p !== proj);
    this.scene.remove(proj.mesh);
    if (proj.arcLine) this.scene.remove(proj.arcLine);
    proj.arcGeometry?.dispose();
    (proj.mesh as THREE.Mesh).geometry?.dispose();
    ((proj.mesh as THREE.Mesh).material as THREE.Material)?.dispose();
    proj.trail.setEmitting(false);
    if (keepTrailFading && proj.trail.isActive()) {
      this.fadingTrails.push(proj.trail);
    } else {
      proj.trail.dispose();
    }
  }

  dispose(): void {
    for (const proj of [...this.active]) this.remove(proj, false);
    for (const trail of [...this.fadingTrails]) trail.dispose();
    this.fadingTrails = [];
  }
}
