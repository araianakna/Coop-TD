// One bespoke visual per tower ability (see game/towers/TowerRegistry.ts —
// 21 abilities, ids shaped `vfx.<element-or-pair>.ability_<name>`, recognized
// by `parseVfxId` in "@/game/vfx/ids" as `{kind: "ability"}`). Routed here by
// VfxManager.emitVfx.
//
// Reuses the same building blocks as ImpactVfx (ParticleSystem bursts, the
// Flash/ExpandingRing/Sequence trio — imported straight from ImpactVfx.ts so
// there's exactly one implementation of each) plus a few new primitives that
// extend the same "camera-facing particles + simple emissive meshes/lines"
// vocabulary into shapes ImpactVfx never needed: a growing/fading/jittering
// polyline (`LineFx`, used for lightning arc-webs, ground fissure cracks,
// curved vine/whip/cage arcs, and wrapping spirals) and a ring of small
// orbiting meshes that can spin up then either collapse inward or fling
// outward (`OrbitCluster`, used for arcane glyph-ring motifs).
//
// Each ability method below composes those primitives into a *shape* that's
// meant to be recognizable on silhouette/motion alone — rising column,
// contracting implosion, radiating fissure, jittered arc-web, wrapping
// spiral, closing cage, sequential rippling rings, etc. — not just a
// recolored version of the same burst. Fusion abilities (7-21) always layer
// both parent elements' color + a nod to both parents' shape vocabulary
// (e.g. Hellbrand = arcane orbit-ring + fire embers; Avalanche = ice shards
// + earth chunks in one heavy downward-crashing fountain).
//
// Usage:
//   const abilities = new AbilityVfx(scene);
//   abilities.trigger("vfx.fire.ability_ignite", worldPos);
//   // each frame:
//   abilities.update(dt);
//   // on teardown:
//   abilities.dispose();
import * as THREE from "three";
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { ParticleSystem } from "@/game/vfx/ParticleSystem";
import { Flash, ExpandingRing, Sequence, type SequenceEffect } from "@/game/vfx/ImpactVfx";

type Vec3 = [number, number, number];

function v3(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

// ---------------------------------------------------------------------------
// Geometry helpers — build point lists for LineFx to draw/animate.
// ---------------------------------------------------------------------------

/** A short jagged line radiating outward from `center` at `angle`, for
 * ground-fissure cracks. */
function crackPoints(center: THREE.Vector3, angle: number, length: number, y: number, jag = 0.18): THREE.Vector3[] {
  const segments = 3;
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const edgeDamp = i === 0 || i === segments ? 0.3 : 1;
    const along = dir.clone().multiplyScalar(length * t);
    const jitter = perp.clone().multiplyScalar((Math.random() - 0.5) * jag * edgeDamp);
    pts.push(center.clone().add(along).add(jitter).setY(y));
  }
  return pts;
}

/** A smooth quadratic-bezier curve sampled into points, for vine/whip/cage arcs. */
function curvePoints(from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3, segments = 12): THREE.Vector3[] {
  return new THREE.QuadraticBezierCurve3(from, ctrl, to).getPoints(segments);
}

/** A spiral ramping from `rStart`/`yStart` to `rEnd`/`yEnd` over `turns`
 * revolutions, for wrapping-vine and draining-spiral shapes. */
function spiralPoints(
  center: THREE.Vector3,
  rStart: number,
  rEnd: number,
  turns: number,
  startAngle: number,
  yStart: number,
  yEnd: number,
  segments = 20,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + t * turns * Math.PI * 2;
    const r = THREE.MathUtils.lerp(rStart, rEnd, t);
    const y = THREE.MathUtils.lerp(yStart, yEnd, t);
    pts.push(new THREE.Vector3(center.x + Math.cos(angle) * r, y, center.z + Math.sin(angle) * r));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// New primitives (alongside Flash/ExpandingRing, reused from ImpactVfx)
// ---------------------------------------------------------------------------

interface LineFxOptions {
  /** Seconds to reveal the line from 0 to full length. 0 = appears instantly. */
  growDuration?: number;
  /** Seconds fully visible after growing, before fading starts. */
  holdDuration?: number;
  /** Seconds to fade out once hold ends. */
  fadeDuration?: number;
  /** World-unit jitter re-randomized every frame on interior points — a
   * crackle/shimmer, used for lightning arcs. 0 = static line. */
  jitter?: number;
  opacity?: number;
  colorMultiplier?: number;
}

/** An animated polyline: grows from its start point, optionally crackles via
 * per-frame jitter, holds, then fades. The single shared primitive behind
 * ground fissures, lightning arc-webs, and vine/whip/cage/spiral shapes —
 * only the input point list and jitter/timing differ. */
class LineFx implements SequenceEffect {
  private scene: THREE.Scene;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private mesh: THREE.Line;
  private points: THREE.Vector3[];
  private basePositions: Float32Array;
  private age = 0;
  private growDuration: number;
  private holdDuration: number;
  private fadeDuration: number;
  private jitter: number;
  private baseOpacity: number;
  private disposed = false;

  constructor(scene: THREE.Scene, points: THREE.Vector3[], color: THREE.Color, opts: LineFxOptions = {}) {
    this.scene = scene;
    this.points = points;
    this.growDuration = opts.growDuration ?? 0;
    this.holdDuration = opts.holdDuration ?? 0.15;
    this.fadeDuration = opts.fadeDuration ?? 0.25;
    this.jitter = opts.jitter ?? 0;
    this.baseOpacity = opts.opacity ?? 0.9;

    const n = points.length;
    const positions = new Float32Array(n * 3);
    this.basePositions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3 + 0] = this.basePositions[i * 3 + 0] = points[i].x;
      positions[i * 3 + 1] = this.basePositions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = this.basePositions[i * 3 + 2] = points[i].z;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setDrawRange(0, this.growDuration > 0 ? Math.min(2, n) : n);

    this.material = new THREE.LineBasicMaterial({
      color: color.clone().multiplyScalar(opts.colorMultiplier ?? 1.8),
      transparent: true,
      opacity: this.baseOpacity,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Line(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(dt: number): boolean {
    this.age += dt;
    const n = this.points.length;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;

    if (this.growDuration > 0 && this.age < this.growDuration) {
      const t = this.age / this.growDuration;
      this.geometry.setDrawRange(0, Math.max(2, Math.round(t * n)));
    } else if (this.geometry.drawRange.count < n) {
      this.geometry.setDrawRange(0, n);
    }

    if (this.jitter > 0) {
      for (let i = 1; i < n - 1; i++) {
        posAttr.setXYZ(
          i,
          this.basePositions[i * 3 + 0] + (Math.random() - 0.5) * this.jitter,
          this.basePositions[i * 3 + 1] + (Math.random() - 0.5) * this.jitter * 0.5,
          this.basePositions[i * 3 + 2] + (Math.random() - 0.5) * this.jitter,
        );
      }
      posAttr.needsUpdate = true;
    }

    const fadeStart = this.growDuration + this.holdDuration;
    if (this.age > fadeStart) {
      const ft = Math.min(1, (this.age - fadeStart) / Math.max(0.001, this.fadeDuration));
      this.material.opacity = this.baseOpacity * (1 - ft);
      if (ft >= 1) {
        this.disposeNow();
        return false;
      }
    }
    return true;
  }

  disposeNow(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface OrbitClusterOptions {
  count: number;
  startRadius: number;
  holdRadius: number;
  /** Seconds spent easing from startRadius to holdRadius (and fading in). */
  spinDuration: number;
  /** rad/sec; sign sets spin direction. */
  angularSpeed: number;
  /** What happens once spinDuration elapses: shrink to nothing (implosion —
   * silence/freeze/drain motifs) or fling outward and fade (release —
   * stamp/overload motifs). */
  finish: "collapse" | "release";
  finishDuration: number;
  meshSize: number;
  meshShape?: "shard" | "orb";
  /** Local height of the orbit plane above `center`. */
  y?: number;
  /** Vertical bob amplitude, 0 = flat plane. */
  bob?: number;
}

/** A ring of small emissive meshes orbiting a center point — the arcane
 * glyph-ring motif from the fusion-tower models, reused as an ability effect
 * beat (spin up, then either collapse inward or release outward). */
class OrbitCluster implements SequenceEffect {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private items: { mesh: THREE.Mesh; angle: number }[] = [];
  private materials: THREE.MeshBasicMaterial[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private age = 0;
  private opts: OrbitClusterOptions;
  private disposed = false;

  constructor(scene: THREE.Scene, center: THREE.Vector3, color: THREE.Color, opts: OrbitClusterOptions) {
    this.scene = scene;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.position.copy(center);
    this.group.position.y += opts.y ?? 0.3;
    scene.add(this.group);

    for (let i = 0; i < opts.count; i++) {
      const angle = (i / opts.count) * Math.PI * 2;
      const geo =
        opts.meshShape === "orb"
          ? new THREE.IcosahedronGeometry(opts.meshSize, 0)
          : new THREE.OctahedronGeometry(opts.meshSize, 0);
      if (opts.meshShape !== "orb") geo.scale(0.55, 1.5, 0.55);
      const mat = new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(2.0),
        transparent: true,
        opacity: 0,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(angle) * opts.startRadius, 0, Math.sin(angle) * opts.startRadius);
      this.group.add(mesh);
      this.items.push({ mesh, angle });
      this.materials.push(mat);
      this.geometries.push(geo);
    }
  }

  update(dt: number): boolean {
    this.age += dt;
    this.group.rotation.y += this.opts.angularSpeed * dt;

    let radius: number;
    let opacity: number;
    let done = false;

    if (this.age < this.opts.spinDuration) {
      const t = this.age / this.opts.spinDuration;
      radius = THREE.MathUtils.lerp(this.opts.startRadius, this.opts.holdRadius, 1 - Math.pow(1 - t, 2));
      opacity = Math.min(1, t / 0.3);
    } else {
      const t2 = Math.min(1, (this.age - this.opts.spinDuration) / Math.max(0.001, this.opts.finishDuration));
      if (this.opts.finish === "collapse") {
        radius = THREE.MathUtils.lerp(this.opts.holdRadius, 0, Math.pow(t2, 1.5));
        opacity = 1 - Math.pow(t2, 2);
      } else {
        radius = THREE.MathUtils.lerp(this.opts.holdRadius, this.opts.holdRadius * 2.6, t2);
        opacity = 1 - t2;
      }
      if (t2 >= 1) done = true;
    }

    const bob = this.opts.bob ?? 0;
    const now = performance.now() * 0.001;
    for (const item of this.items) {
      item.mesh.position.x = Math.cos(item.angle) * radius;
      item.mesh.position.z = Math.sin(item.angle) * radius;
      item.mesh.position.y = bob > 0 ? Math.sin(now * 3 + item.angle * 3) * bob : 0;
      item.mesh.rotation.x += dt * 2;
      item.mesh.rotation.y += dt * 2.4;
      (item.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    if (done) {
      this.disposeNow();
      return false;
    }
    return true;
  }

  disposeNow(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** N jagged ground cracks radiating outward from `center`, staggered growth
 * so they feel like they're splitting outward rather than popping in at once. */
function addFissureBurst(
  scene: THREE.Scene,
  seq: Sequence,
  center: THREE.Vector3,
  color: THREE.Color,
  count: number,
  length: number,
  y: number,
  opts: { growDuration?: number; holdDuration?: number; fadeDuration?: number } = {},
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const len = length * (0.7 + Math.random() * 0.5);
    const pts = crackPoints(center, angle, len, y);
    seq.addEffect(
      new LineFx(scene, pts, color, {
        growDuration: opts.growDuration ?? 0.12,
        holdDuration: opts.holdDuration ?? 0.25,
        fadeDuration: opts.fadeDuration ?? 0.35,
        opacity: 0.95,
        colorMultiplier: 2.0,
      }),
    );
  }
}

/** N crackling lightning bolts jumping from `center` to random nearby
 * points — the shared "arc-web" beat behind every lightning-flavored ability. */
function addArcWeb(
  scene: THREE.Scene,
  seq: Sequence,
  center: THREE.Vector3,
  color: THREE.Color,
  count: number,
  radius: number,
  y: number,
  duration: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = radius * (0.6 + Math.random() * 0.6);
    const end = new THREE.Vector3(center.x + Math.cos(angle) * r, y + 0.15 + Math.random() * 0.6, center.z + Math.sin(angle) * r);
    const mid = center
      .clone()
      .setY(y + 0.3)
      .lerp(end, 0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
    const pts = [center.clone().setY(y), mid, end];
    seq.addEffect(
      new LineFx(scene, pts, color, {
        growDuration: 0,
        holdDuration: duration * 0.6,
        fadeDuration: duration * 0.4,
        jitter: 0.16,
        opacity: 1,
        colorMultiplier: 2.4,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// AbilityVfx
// ---------------------------------------------------------------------------

export class AbilityVfx {
  private scene: THREE.Scene;
  private sequences: Sequence[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Number of ability effects still animating. Read-only introspection for
   * dev tooling (e.g. src/dev/ability-vfx-gallery.ts's QA capture script) —
   * not used by gameplay code. */
  get activeCount(): number {
    return this.sequences.length;
  }

  trigger(vfxId: string, worldPos: [number, number, number]): void {
    switch (vfxId) {
      case "vfx.fire.ability_ignite":
        this.ignite(worldPos);
        return;
      case "vfx.ice.ability_chill":
        this.chill(worldPos);
        return;
      case "vfx.lightning.ability_overcharge":
        this.overcharge(worldPos);
        return;
      case "vfx.nature.ability_toxin":
        this.toxinBloom(worldPos);
        return;
      case "vfx.earth.ability_sunder":
        this.sunder(worldPos);
        return;
      case "vfx.arcane.ability_silence":
        this.silence(worldPos);
        return;
      case "vfx.fire_ice.ability_scald":
        this.scald(worldPos);
        return;
      case "vfx.fire_lightning.ability_discharge":
        this.discharge(worldPos);
        return;
      case "vfx.fire_nature.ability_spread":
        this.spreadingBlaze(worldPos);
        return;
      case "vfx.fire_earth.ability_eruption":
        this.eruption(worldPos);
        return;
      case "vfx.fire_arcane.ability_brand":
        this.hellbrand(worldPos);
        return;
      case "vfx.ice_lightning.ability_shatterbolt":
        this.shatterbolt(worldPos);
        return;
      case "vfx.ice_nature.ability_bind":
        this.rootfrost(worldPos);
        return;
      case "vfx.ice_earth.ability_avalanche":
        this.avalanche(worldPos);
        return;
      case "vfx.ice_arcane.ability_bind":
        this.runeFrostBind(worldPos);
        return;
      case "vfx.lightning_nature.ability_lash":
        this.staticLash(worldPos);
        return;
      case "vfx.lightning_earth.ability_quake":
        this.chainQuake(worldPos);
        return;
      case "vfx.lightning_arcane.ability_surge":
        this.surge(worldPos);
        return;
      case "vfx.nature_earth.ability_smother":
        this.smother(worldPos);
        return;
      case "vfx.nature_arcane.ability_wither":
        this.wither(worldPos);
        return;
      case "vfx.earth_arcane.ability_brand":
        this.forgeBrand(worldPos);
        return;
      default:
        console.warn(`[AbilityVfx] unrecognized ability vfxId "${vfxId}"`);
    }
  }

  update(dt: number): void {
    this.sequences = this.sequences.filter((s) => s.update(dt));
  }

  dispose(): void {
    for (const s of this.sequences) s.disposeNow();
    this.sequences = [];
  }

  // -------------------------------------------------------------------
  // Base-element abilities (1-6)
  // -------------------------------------------------------------------

  /** Ignite — a rising column of fire (3 staggered upward waves), not a
   * single outward burst: reads as flame taking hold and climbing. */
  private ignite(pos: Vec3): void {
    const seq = new Sequence();
    const pal = ELEMENT_PALETTES.fire;
    seq.addFlash(new Flash(this.scene, pos, pal.core, pal.rim, 0.75, 0.16));
    seq.addRing(new ExpandingRing(this.scene, pos, pal.mid, 0.8, 0.3, 0.7));
    for (let wave = 0; wave < 3; wave++) {
      seq.scheduleAt(wave * 0.09, () => {
        const ps = new ParticleSystem(this.scene, {
          colorStart: pal.core,
          colorEnd: pal.edge,
          sizeStart: 0.26,
          sizeEnd: 0.04,
          lifetime: [0.45, 0.75],
          speed: [1.6, 3.2],
          direction: new THREE.Vector3(0, 1, 0),
          spreadAngle: 0.22,
          gravity: new THREE.Vector3(0, 1.6, 0),
          drag: 0.5,
          turbulence: 1.4,
          shape: "soft",
          maxParticles: 26,
          rotationSpeed: [-3, 3],
          intensity: 1.4,
        });
        ps.burst(pos, 22);
        seq.addParticles(ps);
      });
    }
    this.sequences.push(seq);
  }

  /** Deep Chill — a slow creeping frost ring (larger, much slower than a
   * plain impact ring) plus a lingering, near-static mist that settles
   * rather than scattering: a chill that sinks in, not a hit that lands. */
  private chill(pos: Vec3): void {
    const seq = new Sequence();
    const pal = ELEMENT_PALETTES.ice;
    seq.addFlash(new Flash(this.scene, pos, pal.core, pal.rim, 0.6, 0.18));
    seq.addRing(new ExpandingRing(this.scene, pos, pal.mid, 1.6, 0.75, 0.55));
    seq.addRing(new ExpandingRing(this.scene, pos, pal.core, 1.05, 0.5, 0.45));
    const mist = new ParticleSystem(this.scene, {
      colorStart: pal.core,
      colorEnd: pal.mid,
      sizeStart: 0.22,
      sizeEnd: 0.3,
      lifetime: [0.8, 1.3],
      speed: [0.15, 0.5],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.9,
      gravity: new THREE.Vector3(0, -0.35, 0),
      drag: 1.4,
      turbulence: 0.15,
      shape: "shard",
      maxParticles: 26,
      rotationSpeed: [-1, 1],
      intensity: 1.1,
    });
    mist.burst(pos, 26);
    seq.addParticles(mist);
    this.sequences.push(seq);
  }

  /** Overcharge — a crackling arc-web jumping to several points around the
   * target, the signature "lightning" shape reused (with different color,
   * count, and radius) by every lightning-flavored ability below. */
  private overcharge(pos: Vec3): void {
    const seq = new Sequence();
    const pal = ELEMENT_PALETTES.lightning;
    const center = v3(pos);
    seq.addFlash(new Flash(this.scene, pos, pal.core, pal.rim, 0.7, 0.12));
    addArcWeb(this.scene, seq, center, pal.core, 6, 1.1, pos[1], 0.55);
    const sparks = new ParticleSystem(this.scene, {
      colorStart: pal.core,
      colorEnd: pal.mid,
      sizeStart: 0.14,
      sizeEnd: 0.02,
      lifetime: [0.12, 0.24],
      speed: [3, 7],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI,
      gravity: new THREE.Vector3(0, 0, 0),
      drag: 0.3,
      turbulence: 7,
      shape: "spark",
      maxParticles: 34,
      intensity: 1.6,
    });
    sparks.burst(pos, 34);
    seq.addParticles(sparks);
    this.sequences.push(seq);
  }

  /** Toxin Bloom — a puffball of spores that blooms outward in two
   * staggered soft clouds and hangs, rather than scattering like debris. */
  private toxinBloom(pos: Vec3): void {
    const seq = new Sequence();
    const pal = ELEMENT_PALETTES.nature;
    const sick = pal.core.clone().lerp(new THREE.Color(0x9a5fe0), 0.35);
    seq.addFlash(new Flash(this.scene, pos, sick, pal.edge, 0.55, 0.2));
    seq.addRing(new ExpandingRing(this.scene, pos, pal.mid, 1.0, 0.5, 0.55));
    for (let i = 0; i < 2; i++) {
      seq.scheduleAt(i * 0.12, () => {
        const cloud = new ParticleSystem(this.scene, {
          colorStart: sick,
          colorEnd: pal.mid,
          sizeStart: 0.12,
          sizeEnd: 0.42,
          lifetime: [0.7, 1.2],
          speed: [0.4, 1.2],
          direction: new THREE.Vector3(0, 1, 0),
          spreadAngle: Math.PI * 0.8,
          gravity: new THREE.Vector3(0, 0.15, 0),
          drag: 1.6,
          turbulence: 0.5,
          shape: "leaf",
          maxParticles: 22,
          rotationSpeed: [-2, 2],
          intensity: 1.1,
        });
        cloud.burst(pos, 20);
        seq.addParticles(cloud);
      });
    }
    this.sequences.push(seq);
  }

  /** Sunder — radiating ground-crack fissures, the signature shape reused
   * (with a parent-element partner shape) by Avalanche/Chain Quake/Forge
   * Brand below; here alone, plain and earthy. */
  private sunder(pos: Vec3): void {
    const seq = new Sequence();
    const pal = ELEMENT_PALETTES.earth;
    const center = v3(pos);
    seq.addFlash(new Flash(this.scene, pos, pal.core, pal.rim, 0.65, 0.16));
    seq.addRing(new ExpandingRing(this.scene, pos, pal.mid, 1.0, 0.32, 0.7));
    addFissureBurst(this.scene, seq, center, pal.mid, 5, 1.0, pos[1] + 0.02);
    const debris = new ParticleSystem(this.scene, {
      colorStart: pal.core,
      colorEnd: pal.edge,
      sizeStart: 0.24,
      sizeEnd: 0.05,
      lifetime: [0.35, 0.55],
      speed: [1.2, 3.2],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.7,
      gravity: new THREE.Vector3(0, -6, 0),
      drag: 0.4,
      turbulence: 0.1,
      shape: "chunk",
      maxParticles: 20,
      rotationSpeed: [-4, 4],
      intensity: 1.3,
    });
    debris.burst(pos, 18);
    seq.addParticles(debris);
    this.sequences.push(seq);
  }

  /** Silence — an orbiting glyph ring that spins up then implodes to
   * nothing, ending in a small muffled pop: suppression as inward collapse,
   * the opposite silhouette of every outward burst above. */
  private silence(pos: Vec3): void {
    const seq = new Sequence();
    const pal = ELEMENT_PALETTES.arcane;
    const center = v3(pos);
    const spinDuration = 0.22;
    const collapseDuration = 0.2;
    seq.addEffect(
      new OrbitCluster(this.scene, center, pal.core, {
        count: 6,
        startRadius: 1.3,
        holdRadius: 0.5,
        spinDuration,
        angularSpeed: 5.5,
        finish: "collapse",
        finishDuration: collapseDuration,
        meshSize: 0.11,
        meshShape: "shard",
        y: 0.5,
        bob: 0.05,
      }),
    );
    seq.addRing(new ExpandingRing(this.scene, pos, pal.mid, 0.7, 0.35, 0.5));
    seq.scheduleAt(spinDuration + collapseDuration, () => {
      seq.addFlash(new Flash(this.scene, pos, pal.rim, pal.edge, 0.4, 0.18));
    });
    this.sequences.push(seq);
  }

  // -------------------------------------------------------------------
  // Fusion abilities (7-21) — always layer both parents' color + shape
  // -------------------------------------------------------------------

  /** Scald — a soft white-hot vapor cloud (fire's rise + ice's mist in one
   * gradient) with two staggered rings, one per parent hue. */
  private scald(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.fire;
    const pb = ELEMENT_PALETTES.ice;
    const steam = pa.core.clone().lerp(pb.core, 0.55).lerp(new THREE.Color(0xffffff), 0.25);
    seq.addFlash(new Flash(this.scene, pos, steam, pb.rim, 0.9, 0.2));
    seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 1.5, 0.4, 0.7));
    seq.addRing(new ExpandingRing(this.scene, pos, pb.mid, 1.9, 0.55, 0.55));
    const cloud = new ParticleSystem(this.scene, {
      colorStart: steam,
      colorEnd: pb.edge,
      sizeStart: 0.3,
      sizeEnd: 0.5,
      lifetime: [0.5, 0.85],
      speed: [1.5, 3.6],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.95,
      gravity: new THREE.Vector3(0, 1.0, 0),
      drag: 1.0,
      turbulence: 1.0,
      shape: "soft",
      maxParticles: 46,
      intensity: 1.3,
    });
    cloud.burst(pos, 42);
    seq.addParticles(cloud);
    this.sequences.push(seq);
  }

  /** Discharge — a fire-hot arc-web (lightning's shape, warmed by fire's
   * color) with a rising fire-ember layer underneath the sparks. */
  private discharge(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.fire;
    const pb = ELEMENT_PALETTES.lightning;
    const center = v3(pos);
    const hot = pa.core.clone().lerp(pb.core, 0.4);
    seq.addFlash(new Flash(this.scene, pos, hot, pb.rim, 0.85, 0.14));
    addArcWeb(this.scene, seq, center, hot, 5, 1.3, pos[1], 0.55);
    const embers = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pa.edge,
      sizeStart: 0.22,
      sizeEnd: 0.03,
      lifetime: [0.3, 0.5],
      speed: [1.6, 3.6],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.7,
      gravity: new THREE.Vector3(0, 1.2, 0),
      drag: 0.6,
      turbulence: 1.8,
      shape: "soft",
      maxParticles: 22,
      intensity: 1.3,
    });
    embers.burst(pos, 20);
    seq.addParticles(embers);
    const sparks = new ParticleSystem(this.scene, {
      colorStart: pb.core,
      colorEnd: pb.mid,
      sizeStart: 0.12,
      sizeEnd: 0.02,
      lifetime: [0.1, 0.2],
      speed: [3, 7],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI,
      gravity: new THREE.Vector3(0, 0, 0),
      drag: 0.3,
      turbulence: 6,
      shape: "spark",
      maxParticles: 26,
      intensity: 1.5,
    });
    sparks.burst(pos, 24);
    seq.addParticles(sparks);
    this.sequences.push(seq);
  }

  /** Spreading Blaze — 4 curved ember-trails shooting outward from the
   * target and igniting at their tips, visualizing burn jumping to
   * neighbors rather than a single point of damage. */
  private spreadingBlaze(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.fire;
    const pb = ELEMENT_PALETTES.nature;
    const center = v3(pos);
    const blend = pa.core.clone().lerp(pb.core, 0.45);
    seq.addFlash(new Flash(this.scene, pos, blend, pa.rim, 0.7, 0.16));
    seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 0.9, 0.3, 0.6));
    const n = 4;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 1.8 + Math.random() * 0.6;
      const end = new THREE.Vector3(pos[0] + Math.cos(angle) * dist, pos[1] + 0.3 + Math.random() * 0.3, pos[2] + Math.sin(angle) * dist);
      const ctrl = center.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.6, 0));
      const pts = curvePoints(center, ctrl, end, 10);
      seq.addEffect(
        new LineFx(this.scene, pts, blend, { growDuration: 0.22, holdDuration: 0.1, fadeDuration: 0.3, opacity: 0.9, colorMultiplier: 2.0 }),
      );
      seq.scheduleAt(0.2, () => {
        const tip = new ParticleSystem(this.scene, {
          colorStart: pa.core,
          colorEnd: pb.mid,
          sizeStart: 0.14,
          sizeEnd: 0.02,
          lifetime: [0.25, 0.4],
          speed: [0.4, 1.0],
          direction: new THREE.Vector3(0, 1, 0),
          spreadAngle: Math.PI,
          gravity: new THREE.Vector3(0, 0.6, 0),
          drag: 1.2,
          turbulence: 1.0,
          shape: "soft",
          maxParticles: 10,
          intensity: 1.3,
        });
        tip.burst([end.x, end.y, end.z], 8);
        seq.addParticles(tip);
      });
    }
    this.sequences.push(seq);
  }

  /** Eruption — a violent volcanic fountain: earth fissures underfoot plus
   * a tall chunk-and-flame column launched high and raining back down,
   * clearly bigger/heavier than Sunder or Ignite alone. */
  private eruption(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.fire;
    const pb = ELEMENT_PALETTES.earth;
    const center = v3(pos);
    seq.addFlash(new Flash(this.scene, pos, pa.core, pa.rim, 1.1, 0.2));
    seq.addRing(new ExpandingRing(this.scene, pos, pb.mid, 1.8, 0.4, 0.85));
    seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 2.3, 0.55, 0.6));
    addFissureBurst(this.scene, seq, center, pb.edge, 6, 1.4, pos[1] + 0.02);
    const fountain = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pb.edge,
      sizeStart: 0.34,
      sizeEnd: 0.06,
      lifetime: [0.5, 0.9],
      speed: [3.5, 7],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: 0.5,
      gravity: new THREE.Vector3(0, -9, 0),
      drag: 0.3,
      turbulence: 0.6,
      shape: "chunk",
      maxParticles: 36,
      rotationSpeed: [-5, 5],
      intensity: 1.5,
    });
    fountain.burst(pos, 34);
    seq.addParticles(fountain);
    const flame = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pa.edge,
      sizeStart: 0.3,
      sizeEnd: 0.04,
      lifetime: [0.4, 0.65],
      speed: [2, 4.5],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: 0.35,
      gravity: new THREE.Vector3(0, 2, 0),
      drag: 0.4,
      turbulence: 1.6,
      shape: "soft",
      maxParticles: 26,
      intensity: 1.4,
    });
    flame.burst(pos, 24);
    seq.addParticles(flame);
    this.sequences.push(seq);
  }

  /** Hellbrand — an arcane glyph ring spins up then releases outward right
   * as the brand "stamps", flaring into rising fire embers: orbit-then-stamp,
   * distinct from Forge Brand's static ring + ground cracks. */
  private hellbrand(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.fire;
    const pb = ELEMENT_PALETTES.arcane;
    const center = v3(pos);
    const blend = pa.core.clone().lerp(pb.core, 0.4);
    const spinDuration = 0.26;
    seq.addEffect(
      new OrbitCluster(this.scene, center, blend, {
        count: 5,
        startRadius: 0.3,
        holdRadius: 0.95,
        spinDuration,
        angularSpeed: 7,
        finish: "release",
        finishDuration: 0.16,
        meshSize: 0.1,
        meshShape: "shard",
        y: 0.55,
      }),
    );
    seq.scheduleAt(spinDuration, () => {
      seq.addFlash(new Flash(this.scene, pos, blend, pa.rim, 0.95, 0.18));
      seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 1.2, 0.35, 0.75));
      const embers = new ParticleSystem(this.scene, {
        colorStart: pa.core,
        colorEnd: pa.edge,
        sizeStart: 0.22,
        sizeEnd: 0.03,
        lifetime: [0.35, 0.6],
        speed: [1.6, 3.4],
        direction: new THREE.Vector3(0, 1, 0),
        spreadAngle: Math.PI * 0.8,
        gravity: new THREE.Vector3(0, 1.4, 0),
        drag: 0.6,
        turbulence: 1.6,
        shape: "soft",
        maxParticles: 26,
        intensity: 1.4,
      });
      embers.burst(pos, 24);
      seq.addParticles(embers);
    });
    this.sequences.push(seq);
  }

  /** Shatterbolt — two-stage choreography: ice shards fly out then freeze
   * mid-air (near-zero drag-braked), hold for a beat, then a lightning
   * arc-web shatters them. The hold-then-crack timing is the whole point. */
  private shatterbolt(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.ice;
    const pb = ELEMENT_PALETTES.lightning;
    const center = v3(pos);
    seq.addFlash(new Flash(this.scene, pos, pa.core, pa.rim, 0.6, 0.14));
    const freeze = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pa.mid,
      sizeStart: 0.2,
      sizeEnd: 0.16,
      lifetime: [0.4, 0.42],
      speed: [2.4, 3.6],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.85,
      gravity: new THREE.Vector3(0, 0, 0),
      drag: 7,
      turbulence: 0,
      shape: "shard",
      maxParticles: 24,
      rotationSpeed: [-1, 1],
      intensity: 1.3,
    });
    freeze.burst(pos, 22);
    seq.addParticles(freeze);
    seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 1.1, 0.4, 0.7));
    seq.scheduleAt(0.32, () => {
      seq.addFlash(new Flash(this.scene, pos, pb.core, pb.rim, 0.9, 0.12));
      addArcWeb(this.scene, seq, center, pb.core, 6, 1.2, pos[1], 0.5);
      const shatter = new ParticleSystem(this.scene, {
        colorStart: pb.core,
        colorEnd: pa.core,
        sizeStart: 0.16,
        sizeEnd: 0.02,
        lifetime: [0.16, 0.3],
        speed: [4, 8],
        direction: new THREE.Vector3(0, 1, 0),
        spreadAngle: Math.PI,
        gravity: new THREE.Vector3(0, -1, 0),
        drag: 0.4,
        turbulence: 4,
        shape: "spark",
        maxParticles: 30,
        intensity: 1.5,
      });
      shatter.burst(pos, 28);
      seq.addParticles(shatter);
    });
    this.sequences.push(seq);
  }

  /** Rootfrost — 3 icy vines spiral inward and upward around the target
   * (wrapping, not shooting outward like Spreading Blaze's jump-trails). */
  private rootfrost(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.ice;
    const pb = ELEMENT_PALETTES.nature;
    const center = v3(pos);
    const blend = pa.core.clone().lerp(pb.core, 0.4);
    seq.addFlash(new Flash(this.scene, pos, blend, pa.rim, 0.55, 0.16));
    seq.addRing(new ExpandingRing(this.scene, pos, pb.mid, 0.9, 0.4, 0.6));
    for (let i = 0; i < 3; i++) {
      const startAngle = (i / 3) * Math.PI * 2;
      const pts = spiralPoints(center, 1.3, 0.15, 1.1, startAngle, pos[1], pos[1] + 0.9, 16);
      seq.addEffect(
        new LineFx(this.scene, pts, blend, { growDuration: 0.35, holdDuration: 0.25, fadeDuration: 0.35, opacity: 0.85, colorMultiplier: 1.9 }),
      );
    }
    const frost = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pb.mid,
      sizeStart: 0.16,
      sizeEnd: 0.03,
      lifetime: [0.4, 0.6],
      speed: [0.4, 1.0],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.6,
      gravity: new THREE.Vector3(0, -0.3, 0),
      drag: 1.4,
      turbulence: 0.3,
      shape: "shard",
      maxParticles: 20,
      intensity: 1.2,
    });
    frost.burst(pos, 18);
    seq.addParticles(frost);
    this.sequences.push(seq);
  }

  /** Avalanche — a heavy, downward-crashing fountain of ice shards AND earth
   * chunks together (two colors, one violent slam) with a lingering snow
   * tail: the "biggest and heaviest" of the sunder-family effects. */
  private avalanche(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.ice;
    const pb = ELEMENT_PALETTES.earth;
    seq.addFlash(new Flash(this.scene, pos, pa.core, pb.rim, 1.0, 0.2));
    seq.addRing(new ExpandingRing(this.scene, pos, pb.mid, 2.0, 0.4, 0.85));
    seq.scheduleAt(0.06, () => seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 2.4, 0.5, 0.7)));
    const chunks = new ParticleSystem(this.scene, {
      colorStart: pb.core,
      colorEnd: pb.edge,
      sizeStart: 0.3,
      sizeEnd: 0.06,
      lifetime: [0.4, 0.65],
      speed: [2, 5],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.6,
      gravity: new THREE.Vector3(0, -10, 0),
      drag: 0.3,
      turbulence: 0.1,
      shape: "chunk",
      maxParticles: 26,
      rotationSpeed: [-5, 5],
      intensity: 1.4,
    });
    chunks.burst(pos, 24);
    seq.addParticles(chunks);
    const shards = new ParticleSystem(this.scene, {
      colorStart: pa.core,
      colorEnd: pa.edge,
      sizeStart: 0.26,
      sizeEnd: 0.04,
      lifetime: [0.45, 0.75],
      speed: [1.8, 4.2],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.7,
      gravity: new THREE.Vector3(0, -4, 0),
      drag: 0.5,
      turbulence: 0.2,
      shape: "shard",
      maxParticles: 26,
      rotationSpeed: [-4, 4],
      intensity: 1.35,
    });
    shards.burst(pos, 24);
    seq.addParticles(shards);
    seq.scheduleAt(0.3, () => {
      const snow = new ParticleSystem(this.scene, {
        colorStart: pa.core,
        colorEnd: pa.mid,
        sizeStart: 0.1,
        sizeEnd: 0.06,
        lifetime: [0.6, 1.0],
        speed: [0.2, 0.6],
        direction: new THREE.Vector3(0, 1, 0),
        spreadAngle: Math.PI * 0.9,
        gravity: new THREE.Vector3(0, -1.4, 0),
        drag: 1.0,
        turbulence: 0.2,
        shape: "shard",
        maxParticles: 16,
        intensity: 1.0,
      });
      snow.burst(pos, 14);
      seq.addParticles(snow);
    });
    this.sequences.push(seq);
  }

  /** Rune-Frost Bind — 4 arcane shards orbit, then lock: a geometric thread
   * lattice snaps taut between them at the exact freeze moment while the
   * ring itself clamps inward. Distinct from Silence (no lattice threads,
   * pure implosion) via the connecting web that holds visibly after lock. */
  private runeFrostBind(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.ice;
    const pb = ELEMENT_PALETTES.arcane;
    const center = v3(pos);
    const blend = pa.core.clone().lerp(pb.core, 0.45);
    const count = 4;
    const holdRadius = 1.0;
    const spinDuration = 0.3;
    const angularSpeed = 4.2;
    seq.addEffect(
      new OrbitCluster(this.scene, center, blend, {
        count,
        startRadius: 0.4,
        holdRadius,
        spinDuration,
        angularSpeed,
        finish: "collapse",
        finishDuration: 0.14,
        meshSize: 0.1,
        meshShape: "shard",
        y: 0.55,
      }),
    );
    seq.scheduleAt(spinDuration, () => {
      const baseAngle = angularSpeed * spinDuration;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < count; i++) {
        const a = baseAngle + (i / count) * Math.PI * 2;
        pts.push(new THREE.Vector3(center.x + Math.cos(a) * holdRadius, center.y + 0.55, center.z + Math.sin(a) * holdRadius));
      }
      pts.push(pts[0].clone());
      seq.addEffect(new LineFx(this.scene, pts, blend, { growDuration: 0.05, holdDuration: 0.25, fadeDuration: 0.35, opacity: 0.8, colorMultiplier: 1.8 }));
      seq.addFlash(new Flash(this.scene, pos, pa.core, pb.rim, 0.7, 0.16));
      seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 1.1, 0.35, 0.65));
    });
    this.sequences.push(seq);
  }

  /** Static Lash — 3 quick whip-crack vine-arcs snap out one after another,
   * each tip popping with a spark burst: repeated snaps nod to the
   * "periodic shock" mechanic, unlike any single-burst ability above. */
  private staticLash(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.lightning;
    const pb = ELEMENT_PALETTES.nature;
    const center = v3(pos);
    const blend = pb.core.clone().lerp(pa.core, 0.4);
    seq.addFlash(new Flash(this.scene, pos, blend, pa.rim, 0.55, 0.14));
    for (let i = 0; i < 3; i++) {
      seq.scheduleAt(i * 0.14, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.4 + Math.random() * 0.4;
        const end = new THREE.Vector3(center.x + Math.cos(angle) * dist, pos[1] + 0.4, center.z + Math.sin(angle) * dist);
        const ctrl = center.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.5, 0));
        const pts = curvePoints(center, ctrl, end, 8);
        seq.addEffect(new LineFx(this.scene, pts, blend, { growDuration: 0.09, holdDuration: 0.16, fadeDuration: 0.3, opacity: 0.95, colorMultiplier: 2.0 }));
        const tip = new ParticleSystem(this.scene, {
          colorStart: pa.core,
          colorEnd: pb.mid,
          sizeStart: 0.12,
          sizeEnd: 0.02,
          lifetime: [0.12, 0.2],
          speed: [2, 4],
          direction: new THREE.Vector3(0, 1, 0),
          spreadAngle: Math.PI,
          gravity: new THREE.Vector3(0, 0, 0),
          drag: 0.5,
          turbulence: 4,
          shape: "spark",
          maxParticles: 10,
          intensity: 1.4,
        });
        tip.burst([end.x, end.y, end.z], 8);
        seq.addParticles(tip);
      });
    }
    const roots = new ParticleSystem(this.scene, {
      colorStart: pb.core,
      colorEnd: pb.edge,
      sizeStart: 0.16,
      sizeEnd: 0.03,
      lifetime: [0.4, 0.6],
      speed: [0.4, 1.0],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.6,
      gravity: new THREE.Vector3(0, -0.4, 0),
      drag: 1.2,
      turbulence: 0.3,
      shape: "leaf",
      maxParticles: 16,
      intensity: 1.1,
    });
    roots.burst(pos, 14);
    seq.addParticles(roots);
    this.sequences.push(seq);
  }

  /** Chain Quake — 3 sequential rippling rings, each paired with a fresh
   * fissure burst and sparks running along the cracks: cracks that travel
   * outward in waves, unlike Sunder's single static burst or Avalanche's
   * downward-crashing slam or Forge Brand's static glyph-ring stamp. */
  private chainQuake(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.lightning;
    const pb = ELEMENT_PALETTES.earth;
    const center = v3(pos);
    seq.addFlash(new Flash(this.scene, pos, pb.core, pa.rim, 0.75, 0.16));
    const waves = 3;
    for (let w = 0; w < waves; w++) {
      seq.scheduleAt(w * 0.14, () => {
        seq.addRing(new ExpandingRing(this.scene, pos, w % 2 === 0 ? pb.mid : pa.mid, 1.1 + w * 0.6, 0.35, 0.6 - w * 0.1));
        addFissureBurst(this.scene, seq, center, pb.edge, 4, 0.9 + w * 0.5, pos[1] + 0.02, { growDuration: 0.08, holdDuration: 0.15, fadeDuration: 0.3 });
        const sparks = new ParticleSystem(this.scene, {
          colorStart: pa.core,
          colorEnd: pa.mid,
          sizeStart: 0.1,
          sizeEnd: 0.02,
          lifetime: [0.15, 0.25],
          speed: [2, 4],
          direction: new THREE.Vector3(0, 1, 0),
          spreadAngle: Math.PI * 0.5,
          gravity: new THREE.Vector3(0, 0, 0),
          drag: 0.5,
          turbulence: 5,
          shape: "spark",
          maxParticles: 12,
          intensity: 1.4,
        });
        sparks.burst(pos, 10);
        seq.addParticles(sparks);
      });
    }
    const debris = new ParticleSystem(this.scene, {
      colorStart: pb.core,
      colorEnd: pb.edge,
      sizeStart: 0.22,
      sizeEnd: 0.04,
      lifetime: [0.3, 0.5],
      speed: [1, 2.6],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.6,
      gravity: new THREE.Vector3(0, -6, 0),
      drag: 0.4,
      turbulence: 0.1,
      shape: "chunk",
      maxParticles: 16,
      intensity: 1.3,
    });
    debris.burst(pos, 14);
    seq.addParticles(debris);
    this.sequences.push(seq);
  }

  /** Surge — two counter-rotating orbit rings (lightning inner, arcane
   * outer) spin up together then both release outward into one big
   * spark-and-arc overload burst. */
  private surge(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.lightning;
    const pb = ELEMENT_PALETTES.arcane;
    const center = v3(pos);
    const blend = pa.core.clone().lerp(pb.core, 0.4);
    const spinDuration = 0.18;
    seq.addEffect(
      new OrbitCluster(this.scene, center, pa.core, {
        count: 5,
        startRadius: 0.6,
        holdRadius: 0.6,
        spinDuration,
        angularSpeed: 11,
        finish: "release",
        finishDuration: 0.18,
        meshSize: 0.08,
        meshShape: "orb",
        y: 0.6,
      }),
    );
    seq.addEffect(
      new OrbitCluster(this.scene, center, pb.core, {
        count: 5,
        startRadius: 0.9,
        holdRadius: 0.9,
        spinDuration,
        angularSpeed: -8,
        finish: "release",
        finishDuration: 0.2,
        meshSize: 0.09,
        meshShape: "shard",
        y: 0.6,
      }),
    );
    seq.scheduleAt(spinDuration, () => {
      seq.addFlash(new Flash(this.scene, pos, blend, pa.rim, 1.0, 0.16));
      addArcWeb(this.scene, seq, center, blend, 6, 1.4, pos[1], 0.26);
      const burst = new ParticleSystem(this.scene, {
        colorStart: pa.core,
        colorEnd: pb.mid,
        sizeStart: 0.18,
        sizeEnd: 0.03,
        lifetime: [0.2, 0.35],
        speed: [4, 8],
        direction: new THREE.Vector3(0, 1, 0),
        spreadAngle: Math.PI,
        gravity: new THREE.Vector3(0, 0, 0),
        drag: 0.4,
        turbulence: 4,
        shape: "spark",
        maxParticles: 30,
        intensity: 1.6,
      });
      burst.burst(pos, 28);
      seq.addParticles(burst);
    });
    this.sequences.push(seq);
  }

  /** Smother — 4 root arcs erupt from the ground and curl up into a closing
   * cage/dome over the target, with spore mist seeping through: crushing
   * from all sides, unlike Rootfrost's inward spiral-wrap or Spreading
   * Blaze's outward jump-trails. */
  private smother(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.nature;
    const pb = ELEMENT_PALETTES.earth;
    const center = v3(pos);
    const blend = pa.core.clone().lerp(pb.mid, 0.4);
    seq.addFlash(new Flash(this.scene, pos, blend, pb.rim, 0.65, 0.18));
    seq.addRing(new ExpandingRing(this.scene, pos, pb.mid, 1.1, 0.32, 0.7));
    const n = 4;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const groundPt = new THREE.Vector3(center.x + Math.cos(angle) * 0.9, pos[1], center.z + Math.sin(angle) * 0.9);
      const apex = new THREE.Vector3(center.x, pos[1] + 1.6, center.z);
      const ctrl = groundPt.clone().lerp(apex, 0.5).add(new THREE.Vector3(0, 0.3, 0));
      const pts = curvePoints(groundPt, ctrl, apex, 12);
      seq.addEffect(
        new LineFx(this.scene, pts, pa.mid, { growDuration: 0.3, holdDuration: 0.2, fadeDuration: 0.35, opacity: 0.85, colorMultiplier: 1.8 }),
      );
    }
    seq.scheduleAt(0.2, () => {
      const spores = new ParticleSystem(this.scene, {
        colorStart: pa.core,
        colorEnd: pb.edge,
        sizeStart: 0.16,
        sizeEnd: 0.28,
        lifetime: [0.5, 0.8],
        speed: [0.3, 0.8],
        direction: new THREE.Vector3(0, 1, 0),
        spreadAngle: Math.PI * 0.5,
        gravity: new THREE.Vector3(0, 0.3, 0),
        drag: 1.2,
        turbulence: 0.4,
        shape: "leaf",
        maxParticles: 20,
        intensity: 1.15,
      });
      spores.burst(pos, 18);
      seq.addParticles(spores);
    });
    const roots = new ParticleSystem(this.scene, {
      colorStart: pb.core,
      colorEnd: pb.edge,
      sizeStart: 0.2,
      sizeEnd: 0.04,
      lifetime: [0.3, 0.5],
      speed: [1, 2.4],
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: Math.PI * 0.6,
      gravity: new THREE.Vector3(0, -5, 0),
      drag: 0.4,
      turbulence: 0.1,
      shape: "chunk",
      maxParticles: 14,
      intensity: 1.2,
    });
    roots.burst(pos, 12);
    seq.addParticles(roots);
    this.sequences.push(seq);
  }

  /** Wither — a slow, sickly draining spiral: orbiting motes spiral inward
   * and collapse over half a second (much slower than Silence's snap-shut
   * implosion), while leaf-shaped particles droop downward as if wilting. */
  private wither(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.nature;
    const pb = ELEMENT_PALETTES.arcane;
    const center = v3(pos);
    const sick = pa.core.clone().lerp(pb.core, 0.5).lerp(new THREE.Color(0x334422), 0.15);
    seq.addFlash(new Flash(this.scene, pos, sick, pb.edge, 0.5, 0.2));
    const spinDuration = 0.01;
    const collapseDuration = 0.55;
    seq.addEffect(
      new OrbitCluster(this.scene, center, sick, {
        count: 5,
        startRadius: 1.4,
        holdRadius: 1.4,
        spinDuration,
        angularSpeed: 2.6,
        finish: "collapse",
        finishDuration: collapseDuration,
        meshSize: 0.1,
        meshShape: "orb",
        y: 0.6,
        bob: 0.06,
      }),
    );
    seq.scheduleAt(spinDuration + collapseDuration, () => {
      seq.addFlash(new Flash(this.scene, pos, sick, pb.edge, 0.3, 0.25));
    });
    const wilt = new ParticleSystem(this.scene, {
      colorStart: sick,
      colorEnd: pa.edge,
      sizeStart: 0.16,
      sizeEnd: 0.03,
      lifetime: [0.5, 0.8],
      speed: [0.2, 0.5],
      direction: new THREE.Vector3(0, -1, 0),
      spreadAngle: 0.6,
      gravity: new THREE.Vector3(0, -0.6, 0),
      drag: 1.0,
      turbulence: 0.3,
      shape: "leaf",
      maxParticles: 18,
      intensity: 1.05,
    });
    wilt.burst(pos, 16);
    seq.addParticles(wilt);
    this.sequences.push(seq);
  }

  /** Forge Brand — an arcane glyph ring spins up (static hold, no
   * release/collapse motion) while the moment it locks in, ground fissures
   * crack outward beneath it and a heavy stone-and-glyph flash stamps down:
   * the only sunder-family ability combining an orbit ring with cracks. */
  private forgeBrand(pos: Vec3): void {
    const seq = new Sequence();
    const pa = ELEMENT_PALETTES.earth;
    const pb = ELEMENT_PALETTES.arcane;
    const center = v3(pos);
    const blend = pa.mid.clone().lerp(pb.core, 0.45);
    const spinDuration = 0.24;
    seq.addEffect(
      new OrbitCluster(this.scene, center, pb.core, {
        count: 4,
        startRadius: 0.3,
        holdRadius: 1.0,
        spinDuration,
        angularSpeed: 5,
        finish: "collapse",
        finishDuration: 0.001,
        meshSize: 0.11,
        meshShape: "shard",
        y: 0.55,
      }),
    );
    seq.scheduleAt(spinDuration, () => {
      seq.addFlash(new Flash(this.scene, pos, blend, pa.rim, 0.9, 0.18));
      seq.addRing(new ExpandingRing(this.scene, pos, pa.mid, 1.3, 0.35, 0.75));
      addFissureBurst(this.scene, seq, center, pa.edge, 5, 1.1, pos[1] + 0.02);
      const chunks = new ParticleSystem(this.scene, {
        colorStart: pa.core,
        colorEnd: pa.edge,
        sizeStart: 0.24,
        sizeEnd: 0.05,
        lifetime: [0.35, 0.55],
        speed: [1.4, 3.2],
        direction: new THREE.Vector3(0, 1, 0),
        spreadAngle: Math.PI * 0.7,
        gravity: new THREE.Vector3(0, -6, 0),
        drag: 0.4,
        turbulence: 0.1,
        shape: "chunk",
        maxParticles: 18,
        intensity: 1.3,
      });
      chunks.burst(pos, 16);
      seq.addParticles(chunks);
    });
    this.sequences.push(seq);
  }
}
