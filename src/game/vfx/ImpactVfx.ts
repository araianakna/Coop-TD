// Per-element impact bursts (for `impactVfx` ids) plus the tower-fusion
// transformation "wow moment" — a multi-stage charge -> flash -> shockwave
// -> particle explosion -> settle sequence combining both parent elements.
//
// vfx-id convention: `impactVfxId(element)` from "@/game/vfx/ids" produces
// `"vfx.<element>.impact"`; `fusionVfxId(a, b)` produces
// `"vfx.fusion.<a>+<b>"`. VfxManager routes both shapes here.
//
// Usage:
//   const impact = new ImpactVfx(scene);
//   impact.trigger("fire", worldPos);
//   impact.triggerFusion("fire", "nature", worldPos);
//   // each frame:
//   impact.update(dt);
//   // on teardown:
//   impact.dispose();
import * as THREE from "three";
import type { Element } from "@/game/types";
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { ParticleSystem, type ParticleShape } from "@/game/vfx/ParticleSystem";

interface ElementImpactStyle {
  shape: ParticleShape;
  burstCount: number;
  burstSpeed: [number, number];
  burstLifetime: [number, number];
  gravity: THREE.Vector3;
  turbulence: number;
  ringDuration: number;
  ringEndRadius: number;
}

const STYLES: Record<Element, ElementImpactStyle> = {
  fire: {
    shape: "soft",
    burstCount: 34,
    burstSpeed: [1.5, 4.5],
    burstLifetime: [0.25, 0.5],
    gravity: new THREE.Vector3(0, 1.2, 0),
    turbulence: 2.2,
    ringDuration: 0.35,
    ringEndRadius: 1.1,
  },
  ice: {
    shape: "shard",
    burstCount: 30,
    burstSpeed: [2, 5],
    burstLifetime: [0.3, 0.55],
    gravity: new THREE.Vector3(0, -2.5, 0),
    turbulence: 0.2,
    ringDuration: 0.4,
    ringEndRadius: 1.0,
  },
  lightning: {
    shape: "spark",
    burstCount: 40,
    burstSpeed: [3, 8],
    burstLifetime: [0.1, 0.22],
    gravity: new THREE.Vector3(0, 0, 0),
    turbulence: 6,
    ringDuration: 0.22,
    ringEndRadius: 1.3,
  },
  nature: {
    shape: "leaf",
    burstCount: 28,
    burstSpeed: [1, 3],
    burstLifetime: [0.4, 0.7],
    gravity: new THREE.Vector3(0, -0.6, 0),
    turbulence: 0.8,
    ringDuration: 0.45,
    ringEndRadius: 0.9,
  },
  earth: {
    shape: "chunk",
    burstCount: 26,
    burstSpeed: [1.5, 4],
    burstLifetime: [0.35, 0.6],
    gravity: new THREE.Vector3(0, -6, 0),
    turbulence: 0.1,
    ringDuration: 0.3,
    ringEndRadius: 1.0,
  },
  arcane: {
    shape: "shard",
    burstCount: 32,
    burstSpeed: [1.5, 4.5],
    burstLifetime: [0.3, 0.6],
    gravity: new THREE.Vector3(0, 0.3, 0),
    turbulence: 0.6,
    ringDuration: 0.4,
    ringEndRadius: 1.1,
  },
};

/** Anything a `Sequence` can drive: ticked every frame, returns whether it's
 * still alive, and can be torn down early. `AbilityVfx` implements this for
 * its bespoke primitives (arc bolts, orbit clusters, ground fissures, …) so
 * they can share the same `Sequence` scheduler as `Flash`/`ExpandingRing`. */
export interface SequenceEffect {
  update(dt: number): boolean;
  disposeNow(): void;
}

/** Camera-facing single-particle flash — a bright blob that scales down and
 * fades, reused for both small impacts and the big fusion flash. */
export class Flash {
  private system: ParticleSystem;
  private done = false;

  constructor(
    scene: THREE.Scene,
    pos: [number, number, number],
    colorStart: THREE.ColorRepresentation,
    colorEnd: THREE.ColorRepresentation,
    peakSize: number,
    duration: number,
  ) {
    this.system = new ParticleSystem(scene, {
      colorStart,
      colorEnd,
      sizeStart: peakSize,
      sizeEnd: peakSize * 0.15,
      lifetime: [duration, duration],
      speed: [0, 0],
      spreadAngle: 0,
      fadeInFrac: 0.02,
      maxParticles: 1,
      intensity: 1.4,
    });
    this.system.burst(pos, 1);
  }

  update(dt: number): boolean {
    this.system.update(dt);
    if (!this.done && !this.system.isActive()) {
      this.system.dispose();
      this.done = true;
    }
    return !this.done;
  }

  disposeNow() {
    this.system.dispose();
    this.done = true;
  }
}

/** Flat expanding+fading ring, laid on the ground plane under the impact
 * point — the "shockwave" beat. */
export class ExpandingRing {
  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private age = 0;
  private duration: number;
  private endRadius: number;
  private startOpacity: number;
  private scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    pos: [number, number, number],
    color: THREE.Color,
    endRadius: number,
    duration: number,
    startOpacity = 0.9,
  ) {
    this.scene = scene;
    this.duration = duration;
    this.endRadius = endRadius;
    this.startOpacity = startOpacity;
    const geo = new THREE.RingGeometry(0.72, 1, 40);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(1.8),
      transparent: true,
      opacity: startOpacity,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(pos[0], pos[1] + 0.02, pos[2]);
    this.mesh.scale.setScalar(0.05);
    scene.add(this.mesh);
  }

  update(dt: number): boolean {
    this.age += dt;
    const t = Math.min(1, this.age / this.duration);
    const eased = 1 - Math.pow(1 - t, 2); // ease-out
    this.mesh.scale.setScalar(0.05 + eased * this.endRadius);
    this.material.opacity = this.startOpacity * (1 - t);
    if (t >= 1) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export interface ScheduledAction {
  at: number;
  run: () => void;
}

/** A running multi-stage effect sequence (used for simple impacts, the
 * fusion transform, and every AbilityVfx effect) — a bag of live sub-effects
 * plus a schedule of delayed spawns, ticked by age. `addEffect` accepts any
 * `SequenceEffect` (AbilityVfx's bespoke primitives — arc bolts, orbit
 * clusters, fissures, curve-grown vines, …) alongside the built-in
 * Flash/ExpandingRing/ParticleSystem helpers. */
export class Sequence {
  private age = 0;
  private schedule: ScheduledAction[];
  private flashes: Flash[] = [];
  private rings: ExpandingRing[] = [];
  private particleSystems: ParticleSystem[] = [];
  private effects: SequenceEffect[] = [];

  constructor(schedule: ScheduledAction[] = []) {
    this.schedule = [...schedule].sort((a, b) => a.at - b.at);
  }

  scheduleAt(at: number, run: () => void) {
    this.schedule.push({ at, run });
    this.schedule.sort((a, b) => a.at - b.at);
  }

  addFlash(f: Flash) {
    this.flashes.push(f);
  }
  addRing(r: ExpandingRing) {
    this.rings.push(r);
  }
  addParticles(p: ParticleSystem) {
    this.particleSystems.push(p);
  }
  addEffect(e: SequenceEffect) {
    this.effects.push(e);
  }

  update(dt: number): boolean {
    this.age += dt;
    while (this.schedule.length > 0 && this.schedule[0].at <= this.age) {
      this.schedule.shift()!.run();
    }
    this.flashes = this.flashes.filter((f) => f.update(dt));
    this.rings = this.rings.filter((r) => r.update(dt));
    this.effects = this.effects.filter((e) => e.update(dt));
    for (const ps of this.particleSystems) ps.update(dt);
    this.particleSystems = this.particleSystems.filter((ps) => {
      if (ps.isActive()) return true;
      ps.dispose();
      return false;
    });
    return (
      this.schedule.length > 0 ||
      this.flashes.length > 0 ||
      this.rings.length > 0 ||
      this.effects.length > 0 ||
      this.particleSystems.length > 0
    );
  }

  disposeNow() {
    for (const f of this.flashes) f.disposeNow();
    for (const r of this.rings) r.dispose();
    for (const e of this.effects) e.disposeNow();
    for (const ps of this.particleSystems) ps.dispose();
    this.flashes = [];
    this.rings = [];
    this.effects = [];
    this.particleSystems = [];
    this.schedule = [];
  }
}

export class ImpactVfx {
  private scene: THREE.Scene;
  private sequences: Sequence[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Single-element impact burst for `vfx.<element>.impact`. */
  trigger(element: Element, worldPos: [number, number, number]): void {
    const palette = ELEMENT_PALETTES[element];
    const style = STYLES[element];
    const seq = new Sequence([]);

    seq.addFlash(new Flash(this.scene, worldPos, palette.core, palette.rim, 0.95, 0.22));
    seq.addRing(new ExpandingRing(this.scene, worldPos, palette.core, style.ringEndRadius, style.ringDuration, 0.85));

    const burst = new ParticleSystem(this.scene, {
      colorStart: palette.core,
      colorEnd: palette.edge,
      sizeStart: 0.32,
      sizeEnd: 0.05,
      lifetime: style.burstLifetime,
      speed: style.burstSpeed,
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.85,
      gravity: style.gravity,
      drag: 0.6,
      turbulence: style.turbulence,
      shape: style.shape,
      maxParticles: style.burstCount,
      rotationSpeed: [-4, 4],
      intensity: 1.35,
    });
    burst.burst(worldPos, style.burstCount);
    seq.addParticles(burst);

    this.sequences.push(seq);
  }

  /**
   * Signature fusion transformation effect for two parent elements:
   *   1. charge   (0.00s) — particles from both elements converge inward
   *   2. flash    (0.20s) — bright combined-color flash
   *   3. shockwave(0.20s) — two expanding rings (one per parent element)
   *   4. burst    (0.22s) — big two-color particle explosion
   *   5. settle   (0.65s) — slow drifting embers as the new tower "settles"
   */
  triggerFusion(elementA: Element, elementB: Element, worldPos: [number, number, number]): void {
    const pa = ELEMENT_PALETTES[elementA];
    const pb = ELEMENT_PALETTES[elementB];
    const blend = pa.core.clone().lerp(pb.core, 0.5).lerp(new THREE.Color(0xffffff), 0.35);

    const seq = new Sequence([]);

    // Stage 1: charge — energy gathering at the point (grows in size rather
    // than literally converging inward — ParticleSystem's burst cone only
    // supports outward motion — but the short lifetime timed to peak right
    // as the flash fires reads as power building up before it pops).
    const charge = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pb.core,
      sizeStart: 0.05,
      sizeEnd: 0.24,
      lifetime: [0.16, 0.2],
      speed: [0.3, 0.9],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI, // full sphere
      originSpread: 1.6,
      gravity: new THREE.Vector3(0, 0, 0),
      drag: 0,
      shape: "soft",
      maxParticles: 60,
      intensity: 1.4,
    });
    charge.burst(worldPos, 60);
    seq.addParticles(charge);

    const actions: ScheduledAction[] = [
      {
        at: 0.2,
        run: () => {
          // Stage 2: flash — big bright combined-color pop.
          seq.addFlash(new Flash(this.scene, worldPos, blend, blend, 2.1, 0.24));
        },
      },
      {
        at: 0.2,
        run: () => {
          // Stage 3: shockwave — two rings, one per parent element. Uses
          // the more saturated `mid` tone (not `core`, which is often
          // near-white) so each ring keeps its parent's hue instead of
          // washing out to grey once additive-blended + tonemapped. Ring B
          // is deliberately delayed a beat so the two stay visibly
          // separated as concentric bands instead of overlapping into one
          // blurred band.
          seq.addRing(new ExpandingRing(this.scene, worldPos, pa.mid, 2.4, 0.5, 1));
        },
      },
      {
        at: 0.28,
        run: () => {
          seq.addRing(new ExpandingRing(this.scene, worldPos, pb.mid, 3.2, 0.65, 0.9));
        },
      },
      {
        at: 0.22,
        run: () => {
          // Stage 4: explosion — two overlapping color bursts, one per
          // parent element, so the result visibly reads as "both colors".
          // This is the main spectacle beat, sized well above a normal
          // impact burst.
          const explodeCommon = {
            lifetime: [0.55, 1.0] as [number, number],
            speed: [4, 9] as [number, number],
            direction: new THREE.Vector3(0, 1, 0),
            spreadAngle: Math.PI * 0.95,
            gravity: new THREE.Vector3(0, -1.5, 0),
            drag: 0.4,
            turbulence: 1.6,
            maxParticles: 70,
            rotationSpeed: [-5, 5] as [number, number],
            intensity: 1.5,
          };
          const burstA = new ParticleSystem(this.scene, {
            ...explodeCommon,
            colorStart: pa.core,
            colorEnd: pa.edge,
            sizeStart: 0.42,
            sizeEnd: 0.04,
            shape: "shard",
          });
          burstA.burst(worldPos, 70);
          seq.addParticles(burstA);

          const burstB = new ParticleSystem(this.scene, {
            ...explodeCommon,
            colorStart: pb.core,
            colorEnd: pb.edge,
            sizeStart: 0.42,
            sizeEnd: 0.04,
            shape: "soft",
          });
          burstB.burst(worldPos, 70);
          seq.addParticles(burstB);
        },
      },
      {
        at: 0.65,
        run: () => {
          // Stage 5: settle — slow rising embers as the new tower "cools".
          const settle = new ParticleSystem(this.scene, {
            colorStart: blend,
            colorEnd: pa.core.clone().lerp(pb.core, 0.5),
            sizeStart: 0.1,
            sizeEnd: 0.02,
            lifetime: [0.6, 1.1],
            speed: [0.2, 0.6],
            direction: new THREE.Vector3(0, 1, 0),
            spreadAngle: 0.5,
            gravity: new THREE.Vector3(0, 0.4, 0),
            drag: 1,
            turbulence: 0.4,
            shape: "soft",
            maxParticles: 24,
            intensity: 1,
          });
          settle.burst(worldPos, 24);
          seq.addParticles(settle);
        },
      },
    ];

    for (const action of actions) seq.scheduleAt(action.at, action.run);

    this.sequences.push(seq);
  }

  update(dt: number): void {
    this.sequences = this.sequences.filter((s) => s.update(dt));
  }

  dispose(): void {
    for (const s of this.sequences) s.disposeNow();
    this.sequences = [];
  }
}
