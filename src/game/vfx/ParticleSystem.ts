// Reusable GPU-billboarded (CPU-simulated) particle emitter, one instance
// per effect config. Backed by a single THREE.Points + a fixed-size pool of
// typed arrays (no per-frame GC churn). Supports one-shot bursts and
// continuous emission from the same system.
//
// Usage:
//   const sys = new ParticleSystem(scene, { ...config });
//   sys.burst([x, y, z]);          // one-shot: spawns `config.count` particles
//   sys.setEmitOrigin([x, y, z]);  // continuous emitter follows this point
//   sys.setEmitting(true);         // starts continuous emission (needs config.emissionRate)
//   // each frame:
//   sys.update(dt);                // dt in seconds
//   // when done with this system:
//   sys.dispose();
import * as THREE from "three";

export type ParticleShape = "soft" | "shard" | "spark" | "leaf" | "chunk";

const SHAPE_INDEX: Record<ParticleShape, number> = {
  soft: 0,
  shard: 1,
  spark: 2,
  leaf: 3,
  chunk: 4,
};

export interface ParticleConfig {
  /** Bright starting color (particles fade toward colorEnd over lifetime). */
  colorStart: THREE.ColorRepresentation;
  colorEnd: THREE.ColorRepresentation;
  /** Point size in world-ish units at spawn / death. */
  sizeStart: number;
  sizeEnd: number;
  /** [min, max] seconds a particle lives. */
  lifetime: [number, number];
  /** [min, max] initial speed along the emission direction. */
  speed: [number, number];
  /** Cone direction particles are emitted along. Default +Y. */
  direction?: THREE.Vector3;
  /** Half-angle (radians) of the emission cone. Default ~0.6. */
  spreadAngle?: number;
  /** Constant acceleration applied every frame (e.g. downward gravity, or
   * upward for fire's rising heat). */
  gravity?: THREE.Vector3;
  /** Per-second velocity damping, 0 = none, ~2-6 = noticeable drag. */
  drag?: number;
  /** Strength of a cheap turbulent wobble applied to velocity. 0 = off. */
  turbulence?: number;
  /** Billboard shape drawn in the fragment shader. Default "soft". */
  shape?: ParticleShape;
  /** Default particle count for burst() when no override is given. */
  count?: number;
  /** Particles/sec for continuous emission via setEmitting(true). */
  emissionRate?: number;
  /** Random radius jitter applied to the spawn point. */
  originSpread?: number;
  /** [min, max] radians/sec of billboard spin (used by shard/leaf/chunk). */
  rotationSpeed?: [number, number];
  /** Fraction of lifetime spent fading in from 0 alpha. Default 0.08. */
  fadeInFrac?: number;
  /** Max simultaneously-alive particles this system can hold. Default 400. */
  maxParticles?: number;
  /** Overall opacity/brightness multiplier. Default 1. */
  intensity?: number;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aAngle;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vAngle;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vAngle = aAngle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float atten = 260.0 / max(-mvPosition.z, 0.001);
    gl_PointSize = aSize * atten;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vAngle;
  uniform int uShape;
  uniform float uIntensity;

  vec2 rotUv(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    p = rotUv(p, vAngle);
    float alpha = 0.0;
    float core = 0.0;

    if (uShape == 0) {
      // soft round glow
      float d = length(p);
      alpha = smoothstep(1.0, 0.0, d);
      core = smoothstep(0.5, 0.0, d);
    } else if (uShape == 1) {
      // shard: hollow-ish diamond with a bright outline (ice / arcane crystal bits)
      float d = abs(p.x) + abs(p.y);
      alpha = smoothstep(1.05, 0.7, d);
      core = smoothstep(0.55, 0.15, d);
    } else if (uShape == 2) {
      // spark: thin anisotropic streak (lightning)
      vec2 q = vec2(p.x * 0.22, p.y);
      float d = length(q);
      alpha = smoothstep(1.0, 0.0, d);
      core = smoothstep(0.35, 0.0, d);
    } else if (uShape == 3) {
      // leaf: elongated teardrop (nature)
      vec2 q = vec2(p.x * 0.6, p.y - p.x * p.x * 0.35);
      float d = length(q);
      alpha = smoothstep(1.0, 0.35, d);
      core = smoothstep(0.4, 0.0, d);
    } else {
      // chunk: hard-edged low-poly-ish blob (earth debris)
      float d = max(abs(p.x) * 0.9, abs(p.y));
      d = max(d, abs(p.x * 0.6 + p.y * 0.6));
      alpha = step(d, 0.85);
      core = step(d, 0.4);
    }

    vec3 color = vColor * (0.6 + core * 1.8) * uIntensity;
    gl_FragColor = vec4(color, alpha * vAlpha);
    if (gl_FragColor.a <= 0.003) discard;
  }
`;

interface ParticleState {
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  sizeStart: number;
  sizeEnd: number;
  angle: number;
  angularVel: number;
  seed: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private config: Required<
    Pick<
      ParticleConfig,
      | "direction"
      | "spreadAngle"
      | "gravity"
      | "drag"
      | "turbulence"
      | "shape"
      | "count"
      | "originSpread"
      | "rotationSpeed"
      | "fadeInFrac"
      | "maxParticles"
      | "intensity"
    >
  > &
    ParticleConfig;

  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  private maxParticles: number;
  private positions: Float32Array;
  private colors: Float32Array;
  private alphas: Float32Array;
  private sizes: Float32Array;
  private angles: Float32Array;
  private states: ParticleState[];
  private aliveCount = 0;

  private colorStart: THREE.Color;
  private colorEnd: THREE.Color;

  private emitOrigin = new THREE.Vector3();
  private emitting = false;
  private emitAccumulator = 0;

  constructor(scene: THREE.Scene, config: ParticleConfig) {
    this.scene = scene;
    this.config = {
      direction: new THREE.Vector3(0, 1, 0),
      spreadAngle: 0.6,
      gravity: new THREE.Vector3(0, 0, 0),
      drag: 0,
      turbulence: 0,
      shape: "soft",
      count: 24,
      originSpread: 0,
      rotationSpeed: [0, 0],
      fadeInFrac: 0.08,
      maxParticles: 400,
      intensity: 1,
      ...config,
    };

    this.maxParticles = this.config.maxParticles;
    this.colorStart = new THREE.Color(this.config.colorStart);
    this.colorEnd = new THREE.Color(this.config.colorEnd);

    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.alphas = new Float32Array(this.maxParticles);
    this.sizes = new Float32Array(this.maxParticles);
    this.angles = new Float32Array(this.maxParticles);
    this.states = new Array(this.maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aAngle", new THREE.BufferAttribute(this.angles, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uShape: { value: SHAPE_INDEX[this.config.shape] },
        uIntensity: { value: this.config.intensity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /** One-shot spawn of `count` (default config.count) particles at worldPos. */
  burst(worldPos: [number, number, number], count?: number): void {
    const n = count ?? this.config.count;
    for (let i = 0; i < n; i++) this.spawnOne(worldPos);
  }

  /** Anchor point for continuous emission (call every frame if the emitter moves). */
  setEmitOrigin(worldPos: [number, number, number]): void {
    this.emitOrigin.set(worldPos[0], worldPos[1], worldPos[2]);
  }

  setEmitting(on: boolean): void {
    this.emitting = on;
    if (!on) this.emitAccumulator = 0;
  }

  private spawnOne(worldPos: [number, number, number]) {
    if (this.aliveCount >= this.maxParticles) return;
    const idx = this.aliveCount++;

    const spread = this.config.originSpread;
    const ox = worldPos[0] + (spread > 0 ? (Math.random() - 0.5) * spread : 0);
    const oy = worldPos[1] + (spread > 0 ? (Math.random() - 0.5) * spread : 0);
    const oz = worldPos[2] + (spread > 0 ? (Math.random() - 0.5) * spread : 0);
    this.positions[idx * 3 + 0] = ox;
    this.positions[idx * 3 + 1] = oy;
    this.positions[idx * 3 + 2] = oz;

    // Random direction within a cone around config.direction.
    const dir = this.config.direction.clone().normalize();
    const arbitrary = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(dir, arbitrary).normalize();
    const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * this.config.spreadAngle;
    const spawnDir = dir
      .clone()
      .multiplyScalar(Math.cos(phi))
      .addScaledVector(tangent, Math.sin(phi) * Math.cos(theta))
      .addScaledVector(bitangent, Math.sin(phi) * Math.sin(theta))
      .normalize();

    const speed = THREE.MathUtils.lerp(this.config.speed[0], this.config.speed[1], Math.random());
    const life = THREE.MathUtils.lerp(this.config.lifetime[0], this.config.lifetime[1], Math.random());
    const [rotMin, rotMax] = this.config.rotationSpeed;

    this.states[idx] = {
      vx: spawnDir.x * speed,
      vy: spawnDir.y * speed,
      vz: spawnDir.z * speed,
      life,
      maxLife: life,
      sizeStart: this.config.sizeStart * (0.85 + Math.random() * 0.3),
      sizeEnd: this.config.sizeEnd * (0.85 + Math.random() * 0.3),
      angle: Math.random() * Math.PI * 2,
      angularVel: THREE.MathUtils.lerp(rotMin, rotMax, Math.random()),
      seed: Math.random() * 1000,
    };

    this.colors[idx * 3 + 0] = this.colorStart.r;
    this.colors[idx * 3 + 1] = this.colorStart.g;
    this.colors[idx * 3 + 2] = this.colorStart.b;
    this.alphas[idx] = 0;
    this.sizes[idx] = this.states[idx].sizeStart;
    this.angles[idx] = this.states[idx].angle;
  }

  update(dt: number): void {
    if (this.emitting && this.config.emissionRate) {
      this.emitAccumulator += this.config.emissionRate * dt;
      while (this.emitAccumulator >= 1) {
        this.spawnOne([this.emitOrigin.x, this.emitOrigin.y, this.emitOrigin.z]);
        this.emitAccumulator -= 1;
      }
    }

    const g = this.config.gravity;
    const dragF = Math.max(0, 1 - this.config.drag * dt);
    const turb = this.config.turbulence;
    const fadeInFrac = this.config.fadeInFrac;

    let i = 0;
    while (i < this.aliveCount) {
      const s = this.states[i];
      s.life -= dt;
      if (s.life <= 0) {
        // swap-remove with last alive particle to keep the array packed
        const last = this.aliveCount - 1;
        if (i !== last) {
          this.states[i] = this.states[last];
          this.positions[i * 3 + 0] = this.positions[last * 3 + 0];
          this.positions[i * 3 + 1] = this.positions[last * 3 + 1];
          this.positions[i * 3 + 2] = this.positions[last * 3 + 2];
          this.colors[i * 3 + 0] = this.colors[last * 3 + 0];
          this.colors[i * 3 + 1] = this.colors[last * 3 + 1];
          this.colors[i * 3 + 2] = this.colors[last * 3 + 2];
          this.alphas[i] = this.alphas[last];
          this.sizes[i] = this.sizes[last];
          this.angles[i] = this.angles[last];
        }
        this.aliveCount--;
        continue; // re-check index i (now holds the swapped particle)
      }

      s.vx += g.x * dt;
      s.vy += g.y * dt;
      s.vz += g.z * dt;
      if (turb > 0) {
        const t = performance.now() * 0.001;
        s.vx += Math.sin(t * 3.1 + s.seed) * turb * dt;
        s.vy += Math.cos(t * 2.3 + s.seed * 1.7) * turb * dt * 0.6;
        s.vz += Math.sin(t * 2.7 + s.seed * 0.6) * turb * dt;
      }
      s.vx *= dragF;
      s.vy *= dragF;
      s.vz *= dragF;

      this.positions[i * 3 + 0] += s.vx * dt;
      this.positions[i * 3 + 1] += s.vy * dt;
      this.positions[i * 3 + 2] += s.vz * dt;

      s.angle += s.angularVel * dt;
      this.angles[i] = s.angle;

      const t = 1 - s.life / s.maxLife;
      this.sizes[i] = THREE.MathUtils.lerp(s.sizeStart, s.sizeEnd, t);
      this.colors[i * 3 + 0] = THREE.MathUtils.lerp(this.colorStart.r, this.colorEnd.r, t);
      this.colors[i * 3 + 1] = THREE.MathUtils.lerp(this.colorStart.g, this.colorEnd.g, t);
      this.colors[i * 3 + 2] = THREE.MathUtils.lerp(this.colorStart.b, this.colorEnd.b, t);

      const fadeIn = fadeInFrac > 0 ? Math.min(1, t / fadeInFrac) : 1;
      const fadeOut = Math.min(1, s.life / (s.maxLife * 0.3));
      this.alphas[i] = Math.min(fadeIn, fadeOut);

      i++;
    }

    this.geometry.setDrawRange(0, this.aliveCount);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAngle as THREE.BufferAttribute).needsUpdate = true;
  }

  /** True while any particle is alive or continuous emission is active — use
   * this to know when a one-shot burst's owner can be safely torn down. */
  isActive(): boolean {
    return this.aliveCount > 0 || this.emitting;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
