// Procedural low-poly creature models for the enemy roster in EnemyRegistry.ts.
//
// Everything here is built from three.js primitives + noise-jittered
// geometry — no external assets, no skeletal rig. Each builder returns an
// `EnemyModel`: a THREE.Group ready to be added to the scene, plus an
// `update(dtSeconds, elapsedSeconds)` closure the caller ticks every frame
// to drive idle animation (bob, breathing glow, wing flap, burrow dip, ...).
//
// Usage (orchestrator, e.g. Game.ts):
//   const { group, update } = createEnemyModel(enemyDef.modelId);
//   scene.add(group);
//   // each frame: update(dt, elapsed);

import * as THREE from "three";
import { createNoise3D, type NoiseFunction3D } from "simplex-noise";

export interface EnemyModel {
  group: THREE.Group;
  update: (dtSeconds: number, elapsedSeconds: number) => void;
}

// ---------------------------------------------------------------------------
// RNG / noise helpers — deterministic per-model so re-instantiating the same
// enemyId always yields the same silhouette (important for visual read).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function noiseFor(seed: string): NoiseFunction3D {
  return createNoise3D(mulberry32(hashString(seed)));
}

/** Displaces every vertex of `geo` along its true surface-normal direction
 * by simplex noise, producing organic/rocky/crystalline irregularity
 * cheaply. Uses the geometry's actual computed normals (not
 * normalized-position-from-origin) so it stays correct on non-spherical
 * bases like elongated boxes — using position-as-normal on those pulls
 * corner vertices off along diagonals and fragments the shape into
 * disconnected-looking shards. Mutates and returns `geo`. */
function jitter(geo: THREE.BufferGeometry, amount: number, seed: string, freq = 1): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const noise3D = noiseFor(seed);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const normal = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(normal, i);
    const d = noise3D(v.x * freq, v.y * freq, v.z * freq);
    v.addScaledVector(n, d * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function jaggedIcosahedron(radius: number, detail: number, amount: number, seed: string, freq = 1): THREE.BufferGeometry {
  return jitter(new THREE.IcosahedronGeometry(radius, detail), amount, seed, freq);
}

/** A cone with its local origin at the BASE (tip points +Y) instead of
 * three.js's default center-of-bounding-box origin. Spikes/horns/claws
 * placed with a center-anchored cone end up half-embedded in the body
 * they're attached to, which — combined with a jittered, non-convex host
 * surface — creates ugly light-leak seams where the embedded half peeks
 * through gaps in the host mesh. Base-anchoring means `addPart(..., pos,
 * rot)` puts the base exactly at `pos` and the whole cone reads cleanly
 * outward from the surface. */
function baseCone(radius: number, height: number, segments = 4): THREE.ConeGeometry {
  const g = new THREE.ConeGeometry(radius, height, segments);
  g.translate(0, height / 2, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Material helpers — calibrated against the lighting rig in
// src/core/Lighting.ts (sun 1.6, hemi 0.5, fill 0.35) and the bloom pass
// (luminanceThreshold 1.05) in src/core/Renderer.ts: emissiveIntensity in
// the ~1.5-2.8 range blooms nicely without clipping to a white blob.
// ---------------------------------------------------------------------------

function matteMat(color: number, roughness = 0.85, metalness = 0.08): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function crystalMat(color: number, roughness = 0.2, metalness = 0.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function glowMat(
  color: number,
  emissive: number,
  intensity = 2.0,
  opts: { roughness?: number; metalness?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.2,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
}

function addPart<T extends THREE.Object3D>(
  parent: THREE.Object3D,
  mesh: T,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] | number = 1,
): T {
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (typeof scale === "number") mesh.scale.setScalar(scale);
  else mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A handful of small emissive spheres that drift upward and loop —
 * a cheap stand-in for an ember/spore/frost-mote particle system. */
function createEmberField(
  count: number,
  color: number,
  spread: number,
  riseHeight: number,
  seedTag: string,
): { group: THREE.Group; update: (dt: number, elapsed: number) => void } {
  const group = new THREE.Group();
  const rand = mulberry32(hashString(seedTag));
  const embers: { mesh: THREE.Mesh; phase: number; speed: number; x: number; z: number; r: number }[] = [];
  const geo = new THREE.SphereGeometry(1, 6, 6);
  for (let i = 0; i < count; i++) {
    const r = 0.02 + rand() * 0.025;
    const mesh = new THREE.Mesh(geo, glowMat(color, color, 2.4, { roughness: 0.6, metalness: 0 }));
    mesh.scale.setScalar(r);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const x = (rand() - 0.5) * spread;
    const z = (rand() - 0.5) * spread;
    const phase = rand() * Math.PI * 2;
    const speed = 0.4 + rand() * 0.4;
    embers.push({ mesh, phase, speed, x, z, r });
    group.add(mesh);
  }
  function update(_dt: number, elapsed: number) {
    for (const e of embers) {
      const t = (elapsed * e.speed + e.phase) % 1;
      e.mesh.position.set(e.x, t * riseHeight, e.z);
      const fade = Math.sin(t * Math.PI); // 0 at birth/death, 1 mid-flight
      e.mesh.scale.setScalar(e.r * (0.5 + fade * 0.5));
      const m = e.mesh.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1.2 + fade * 1.8;
    }
  }
  return { group, update };
}

// ---------------------------------------------------------------------------
// Builders — one per enemy `modelId`.
// ---------------------------------------------------------------------------

function buildThornling(): EnemyModel {
  const group = new THREE.Group();
  const bodyMat = matteMat(0x3d5c2a, 0.9, 0.05);
  const hideMat = matteMat(0x2a3f1c, 0.9, 0.05);
  const eyeMat = glowMat(0x9dff4f, 0xbaff5a, 1.9, { roughness: 0.5 });

  const body = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.36, 1, 0.07, "thornling-body"), bodyMat),
    [0, 0.38, 0],
    [0, 0, 0],
    [1.15, 0.85, 1],
  );
  const head = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.2, 1, 0.05, "thornling-head"), bodyMat),
    [0, 0.5, 0.34],
  );

  const legs: THREE.Mesh[] = [];
  const legGeo = new THREE.ConeGeometry(0.06, 0.34, 5);
  for (const [x, z] of [
    [0.22, 0.2],
    [-0.22, 0.2],
    [0.22, -0.2],
    [-0.22, -0.2],
  ] as [number, number][]) {
    const leg = new THREE.Mesh(legGeo, hideMat) as THREE.Mesh;
    addPart(group, leg, [x, 0.16, z], [Math.PI, 0, 0]);
    legs.push(leg);
  }

  // Spine ridge spikes: bases sit exactly on the body's ellipsoid surface
  // (computed analytically from its radius/scale) so they read as a clean
  // ridge instead of half-swallowed needles poking through gaps in the
  // jittered shell.
  const thornBodyCenterY = 0.38;
  const thornBodySemiY = 0.36 * 0.85;
  const thornBodySemiZ = 0.36;
  const thornSpikeGeo = baseCone(0.06, 0.34, 4);
  const spikeMat = glowMat(0x5a8a3a, 0x9dff4f, 1.9, { roughness: 0.55 });
  const spikes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const z = -0.16 + t * 0.36;
    const zr = THREE.MathUtils.clamp(z / thornBodySemiZ, -0.98, 0.98);
    const y = thornBodyCenterY + thornBodySemiY * Math.sqrt(1 - zr * zr) + 0.015;
    const spike = new THREE.Mesh(thornSpikeGeo, spikeMat);
    addPart(group, spike, [0, y, z], [0.55 - t * 0.5, 0, 0], 0.8 + t * 0.45);
    spikes.push(spike);
  }

  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [0.09, 0.52, 0.5]);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [-0.09, 0.52, 0.5]);

  const fangGeo = baseCone(0.025, 0.11, 4);
  const fangMat = matteMat(0xe8f0d8, 0.4, 0.05);
  addPart(group, new THREE.Mesh(fangGeo, fangMat), [0.06, 0.46, 0.53], [Math.PI, 0, 0]);
  addPart(group, new THREE.Mesh(fangGeo, fangMat), [-0.06, 0.46, 0.53], [Math.PI, 0, 0]);

  function update(_dt: number, elapsed: number) {
    const bob = Math.sin(elapsed * 6.5) * 0.035;
    group.position.y = Math.max(0, bob);
    body.scale.set(1.15 + Math.sin(elapsed * 6.5) * 0.03, 0.85 - Math.sin(elapsed * 6.5) * 0.03, 1);
    head.position.y = 0.5 + Math.sin(elapsed * 6.5 + 1) * 0.02;
    legs.forEach((leg, i) => {
      leg.rotation.x = Math.PI + Math.sin(elapsed * 9 + i * 1.5) * 0.25;
    });
    spikes.forEach((s, i) => {
      s.rotation.z = Math.sin(elapsed * 3 + i) * 0.08;
    });
  }

  return { group, update };
}

function buildCragback(): EnemyModel {
  const group = new THREE.Group();
  const shellMat = matteMat(0x6e5c46, 0.85, 0.1);
  const crackMat = glowMat(0xff9a3c, 0xffb347, 1.8, { roughness: 0.5 });
  const legMat = matteMat(0x40331f, 0.8, 0.1);

  const shell = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.62, 1, 0.07, "cragback-shell"), shellMat),
    [0, 0.42, 0],
    [0, 0, 0],
    [1, 0.55, 1.15],
  );
  addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.24, 1, 0.04, "cragback-head"), shellMat),
    [0, 0.28, 0.58],
    [0, 0, 0],
    [1, 0.8, 0.9],
  );

  const pincerGeo = baseCone(0.045, 0.26, 4);
  const pincers: THREE.Mesh[] = [];
  for (const x of [0.13, -0.13]) {
    const pincer = new THREE.Mesh(pincerGeo, legMat);
    addPart(group, pincer, [x, 0.24, 0.8], [Math.PI / 2 + 0.3, 0, Math.sign(x) * 0.35]);
    pincers.push(pincer);
  }

  const cracks: THREE.Mesh[] = [];
  const crackGeo = new THREE.BoxGeometry(0.05, 0.02, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const crack = new THREE.Mesh(crackGeo, crackMat);
    addPart(
      group,
      crack,
      [Math.sin(a) * 0.4, 0.5 + Math.cos(i) * 0.04, Math.cos(a) * 0.35],
      [0, -a, 0],
    );
    cracks.push(crack);
  }

  const legGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.34, 5);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [0.56, 0.32],
    [0.58, 0],
    [0.56, -0.32],
    [-0.56, 0.32],
    [-0.58, 0],
    [-0.56, -0.32],
  ] as [number, number][]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    addPart(group, leg, [x, 0.14, z], [0, 0, Math.sign(x) * 0.6]);
    legs.push(leg);
  }

  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const eyeMat = glowMat(0xff5a3c, 0xff5a3c, 1.6, { roughness: 0.4 });
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [0.1, 0.32, 0.72]);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [-0.1, 0.32, 0.72]);

  function update(_dt: number, elapsed: number) {
    group.rotation.z = Math.sin(elapsed * 1.4) * 0.03;
    group.position.y = Math.sin(elapsed * 1.4) * 0.015;
    const pulse = 1.1 + Math.sin(elapsed * 2.2) * 0.5;
    for (const c of cracks) (c.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
    legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(elapsed * 1.4 + i * 1.1) * 0.12;
    });
    pincers.forEach((p, i) => {
      p.rotation.z = Math.sign(p.position.x) * (0.35 + Math.sin(elapsed * 2 + i) * 0.12);
    });
    void shell;
  }

  return { group, update };
}

function buildSkitterwing(): EnemyModel {
  const group = new THREE.Group();
  const coreMat = glowMat(0x6a2fbf, 0xb073ff, 2.1, { roughness: 0.35, metalness: 0.3 });
  const wingMat = glowMat(0x8a4fe0, 0xa066ff, 1.4, {
    roughness: 0.3,
    metalness: 0.4,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });

  addPart(group, new THREE.Mesh(jaggedIcosahedron(0.16, 1, 0.03, "skitterwing-core"), coreMat), [0, 0.9, 0]);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.35, 0.28, 0.5, 0.05);
  wingShape.quadraticCurveTo(0.42, -0.05, 0.3, -0.02);
  wingShape.quadraticCurveTo(0.18, -0.16, 0, -0.02);
  wingShape.closePath();
  const wingGeo = new THREE.ShapeGeometry(wingShape);

  const wingL = new THREE.Mesh(wingGeo, wingMat);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  const wingPivotL = new THREE.Group();
  const wingPivotR = new THREE.Group();
  wingPivotL.position.set(0.05, 0.9, 0);
  wingPivotR.position.set(-0.05, 0.9, 0);
  wingR.rotation.y = Math.PI;
  wingPivotL.add(wingL);
  wingPivotR.add(wingR);
  group.add(wingPivotL, wingPivotR);

  const tailGeo = new THREE.ConeGeometry(0.03, 0.16, 5);
  const tail = addPart(group, new THREE.Mesh(tailGeo, coreMat), [0, 0.86, -0.2], [Math.PI / 2, 0, 0]);

  function update(_dt: number, elapsed: number) {
    group.position.y = 0.15 + Math.sin(elapsed * 1.8) * 0.08;
    const flap = Math.sin(elapsed * 11) * 0.7 + 0.15;
    wingPivotL.rotation.z = flap;
    wingPivotR.rotation.z = -flap;
    tail.rotation.z = Math.sin(elapsed * 4) * 0.3;
    group.rotation.y = Math.sin(elapsed * 0.7) * 0.15;
  }

  return { group, update };
}

function buildVoltling(): EnemyModel {
  const group = new THREE.Group();
  const coreMat = crystalMat(0x2a6fff, 0.15, 0.5);
  const shardMat = glowMat(0x6fa8ff, 0x9fd4ff, 2.5, { roughness: 0.1, metalness: 0.5 });

  const core = addPart(group, new THREE.Mesh(jaggedIcosahedron(0.2, 0, 0.04, "voltling-core"), coreMat), [0, 0.21, 0]);

  const shardGeo = baseCone(0.045, 0.32, 4);
  const shards: THREE.Mesh[] = [];
  const upAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const outward = new THREE.Vector3(Math.sin(a), 0.35, Math.cos(a)).normalize();
    const shard = new THREE.Mesh(shardGeo, shardMat);
    shard.position.set(outward.x * 0.19, 0.21 + outward.y * 0.19, outward.z * 0.19);
    shard.quaternion.setFromUnitVectors(upAxis, outward);
    shard.castShadow = true;
    group.add(shard);
    shards.push(shard);
  }

  const basePos = new THREE.Vector3();
  const rand = mulberry32(hashString("voltling-jitter"));

  function update(_dt: number, elapsed: number) {
    const jx = (Math.sin(elapsed * 17 + 1) + Math.sin(elapsed * 23)) * 0.015;
    const jz = (Math.cos(elapsed * 19) + Math.sin(elapsed * 13 + 2)) * 0.015;
    group.position.set(basePos.x + jx, 0.02 + Math.abs(Math.sin(elapsed * 14)) * 0.06, basePos.z + jz);
    group.rotation.y = elapsed * 2.5;
    const flicker = 1.4 + rand() * 0.6;
    for (const s of shards) (s.material as THREE.MeshStandardMaterial).emissiveIntensity = flicker;
    core.scale.setScalar(1 + Math.sin(elapsed * 30) * 0.06);
  }

  return { group, update };
}

function buildFrostfang(): EnemyModel {
  const group = new THREE.Group();
  const iceMat = crystalMat(0xbfe8ff, 0.2, 0.35);
  const veinMat = glowMat(0x9fe8ff, 0x9fe8ff, 2.0, { roughness: 0.2, metalness: 0.3 });

  const body = addPart(
    group,
    new THREE.Mesh(jitter(new THREE.BoxGeometry(0.7, 0.36, 0.4, 3, 2, 2), 0.04, "frostfang-body"), iceMat),
    [0, 0.4, 0],
  );
  const head = addPart(
    group,
    new THREE.Mesh(jitter(new THREE.BoxGeometry(0.26, 0.22, 0.34, 2, 2, 2), 0.02, "frostfang-head"), iceMat),
    [0, 0.44, 0.42],
  );
  const jaw = addPart(
    group,
    new THREE.Mesh(baseCone(0.04, 0.14, 4), veinMat),
    [0, 0.36, 0.6],
    [Math.PI / 2, 0, 0],
  );

  const spikeGeo = baseCone(0.05, 0.3, 4);
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    addPart(
      group,
      new THREE.Mesh(spikeGeo, veinMat),
      [0, 0.56, -0.2 + t * 0.5],
      [0.3, 0, 0],
      0.9 - t * 0.15,
    );
  }

  const legGeo = new THREE.BoxGeometry(0.1, 0.32, 0.1);
  const legPivots: THREE.Group[] = [];
  for (const [x, z] of [
    [0.26, 0.16],
    [-0.26, 0.16],
    [0.26, -0.16],
    [-0.26, -0.16],
  ] as [number, number][]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.32, z);
    const leg = new THREE.Mesh(legGeo, iceMat);
    leg.position.y = -0.14;
    leg.castShadow = true;
    pivot.add(leg);
    group.add(pivot);
    legPivots.push(pivot);
  }

  const tail = addPart(
    group,
    new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), iceMat),
    [0, 0.42, -0.42],
    [Math.PI / 2 + 0.3, 0, 0],
  );

  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
  const eyeMat = glowMat(0x2fe0ff, 0x7ff0ff, 2.2, { roughness: 0.3 });
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [0.08, 0.5, 0.62]);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [-0.08, 0.5, 0.62]);

  function update(_dt: number, elapsed: number) {
    const stride = elapsed * 7;
    group.position.y = Math.abs(Math.sin(stride)) * 0.04;
    legPivots.forEach((p, i) => {
      p.rotation.x = Math.sin(stride + (i % 2 === 0 ? 0 : Math.PI)) * 0.5;
    });
    head.position.y = 0.46 + Math.sin(stride * 0.5) * 0.015;
    tail.rotation.y = Math.sin(elapsed * 3) * 0.25;
    jaw.scale.y = 1 + Math.sin(elapsed * 5) * 0.15;
    void body;
  }

  return { group, update };
}

function buildCinderling(): EnemyModel {
  const group = new THREE.Group();
  const rockMat = matteMat(0x3c2a20, 0.7, 0.15);
  const crackMat = glowMat(0xff5a1f, 0xff5a1f, 2.6, { roughness: 0.5 });

  const body = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.28, 1, 0.06, "cinderling-body"), rockMat),
    [0, 0.62, 0.02],
    [0.15, 0, 0],
  );
  const head = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.17, 1, 0.04, "cinderling-head"), rockMat),
    [0, 0.86, 0.16],
  );

  const hornGeo = baseCone(0.035, 0.18, 4);
  addPart(group, new THREE.Mesh(hornGeo, rockMat), [0.08, 0.95, 0.1], [-0.3, 0, 0.2]);
  addPart(group, new THREE.Mesh(hornGeo, rockMat), [-0.08, 0.95, 0.1], [-0.3, 0, -0.2]);

  const crackGeo = new THREE.BoxGeometry(0.045, 0.22, 0.045);
  const cracks: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = new THREE.Mesh(crackGeo, crackMat);
    addPart(group, c, [Math.sin(a) * 0.22, 0.55 + (i % 2) * 0.1, 0.02 + Math.cos(a) * 0.2], [0, a, Math.PI / 5]);
    cracks.push(c);
  }

  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
  addPart(group, new THREE.Mesh(eyeGeo, crackMat), [0.07, 0.88, 0.28]);
  addPart(group, new THREE.Mesh(eyeGeo, crackMat), [-0.07, 0.88, 0.28]);

  // Hunched bipedal legs + clawed arms for a distinct imp-like posture.
  const legGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.34, 5);
  const legPivots: THREE.Group[] = [];
  for (const x of [0.13, -0.13]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.34, 0);
    const leg = new THREE.Mesh(legGeo, rockMat);
    leg.position.y = -0.17;
    pivot.add(leg);
    group.add(pivot);
    legPivots.push(pivot);
  }
  const armGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.3, 5);
  const armPivots: THREE.Group[] = [];
  for (const x of [0.26, -0.26]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.72, 0.05);
    const arm = new THREE.Mesh(armGeo, rockMat);
    arm.position.y = -0.14;
    pivot.add(arm);
    group.add(pivot);
    armPivots.push(pivot);
  }

  const embers = createEmberField(6, 0xff7a2f, 0.35, 0.9, "cinderling-embers");
  embers.group.position.y = 0.4;
  group.add(embers.group);

  function update(dt: number, elapsed: number) {
    const stride = elapsed * 6;
    group.position.y = Math.abs(Math.sin(stride)) * 0.03;
    legPivots.forEach((p, i) => (p.rotation.x = Math.sin(stride + i * Math.PI) * 0.35));
    armPivots.forEach((p, i) => (p.rotation.x = Math.sin(stride + i * Math.PI + Math.PI) * 0.3));
    head.rotation.y = Math.sin(elapsed * 1.5) * 0.2;
    const pulse = 1.8 + Math.sin(elapsed * 5) * 0.7;
    for (const c of cracks) (c.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
    embers.update(dt, elapsed);
    void body;
  }

  return { group, update };
}

function buildQuagbrute(): EnemyModel {
  const group = new THREE.Group();
  const oozeMat = matteMat(0x445c30, 0.55, 0.08);
  const mawMat = matteMat(0x0c0f08, 0.6, 0.0);

  const mainGeo = jaggedIcosahedron(0.85, 1, 0.16, "quagbrute-main", 1.3);
  const main = addPart(group, new THREE.Mesh(mainGeo, oozeMat), [0, 0.55, 0], [0, 0, 0], [1.1, 0.85, 1.15]);

  const lumps: THREE.Mesh[] = [];
  for (const [x, y, z, r] of [
    [0.55, 0.3, 0.3, 0.42],
    [-0.5, 0.25, -0.2, 0.38],
    [0.1, 0.15, -0.55, 0.34],
  ] as [number, number, number, number][]) {
    const lump = new THREE.Mesh(jaggedIcosahedron(r, 1, 0.08, `quagbrute-lump-${x}`), oozeMat);
    addPart(group, lump, [x, y, z]);
    lumps.push(lump);
  }

  const sporeGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const sporeMat = glowMat(0xc8ff6a, 0xc8ff6a, 1.6, { roughness: 0.6 });
  const spores: THREE.Mesh[] = [];
  const rand = mulberry32(hashString("quagbrute-spores"));
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.4 + rand() * 0.4;
    const spore = new THREE.Mesh(sporeGeo, sporeMat);
    addPart(group, spore, [Math.sin(a) * r, 0.3 + rand() * 0.5, Math.cos(a) * r]);
    spores.push(spore);
  }

  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const eyeMat = glowMat(0xff5a2f, 0xff5a2f, 1.9, { roughness: 0.4 });
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [0.16, 0.62, 0.62]);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [-0.14, 0.6, 0.6]);

  const maw = addPart(
    group,
    new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 12, Math.PI), mawMat),
    [0, 0.42, 0.68],
    [0.15, 0, Math.PI],
  );

  function update(_dt: number, elapsed: number) {
    const breathe = Math.sin(elapsed * 1.6);
    main.scale.set(1.1 + breathe * 0.05, 0.85 - breathe * 0.06, 1.15 + breathe * 0.03);
    group.position.y = -0.02 + Math.max(0, breathe) * 0.02;
    lumps.forEach((l, i) => {
      l.position.y += Math.sin(elapsed * 1.6 + i) * 0.0005;
      l.scale.setScalar(1 + Math.sin(elapsed * 1.6 + i * 2) * 0.04);
    });
    spores.forEach((s, i) => {
      const m = s.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1.1 + Math.sin(elapsed * 3 + i * 1.3) * 0.7;
    });
    maw.scale.y = 1 + Math.max(0, breathe) * 0.4;
  }

  return { group, update };
}

function buildSandveil(): EnemyModel {
  const group = new THREE.Group();
  const shellMat = matteMat(0xc9a466, 0.85, 0.08);
  const darkMat = matteMat(0x8a6a3f, 0.85, 0.08);
  const stingerMat = glowMat(0xffb347, 0xffb347, 1.8, { roughness: 0.4 });

  const segMat = [shellMat, darkMat, shellMat];
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(
      jitter(new THREE.BoxGeometry(0.34 - i * 0.04, 0.18, 0.3 - i * 0.03, 2, 1, 2), 0.02, `sandveil-seg-${i}`),
      segMat[i],
    );
    addPart(group, seg, [0, 0.22, 0.22 - i * 0.26]);
    segments.push(seg);
  }

  const clawGeo = baseCone(0.09, 0.24, 4);
  const claws: THREE.Group[] = [];
  for (const x of [0.24, -0.24]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.2, 0.5);
    const claw = new THREE.Mesh(clawGeo, darkMat);
    claw.rotation.z = Math.sign(x) * 1.3;
    claw.position.x = Math.sign(x) * 0.06;
    pivot.add(claw);
    group.add(pivot);
    claws.push(pivot);
  }

  const tailParts: THREE.Group[] = [];
  let prevPos: [number, number, number] = [0, 0.3, -0.6];
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0, 0);
  group.add(tailRoot);
  let currentParent: THREE.Object3D = tailRoot;
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, i === 0 ? 0.3 : 0.16, i === 0 ? -0.55 : -0.16);
    const r = 0.09 - i * 0.015;
    const segMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), darkMat);
    pivot.add(segMesh);
    currentParent.add(pivot);
    currentParent = pivot;
    tailParts.push(pivot);
  }
  const stinger = new THREE.Mesh(baseCone(0.045, 0.18, 4), stingerMat);
  stinger.position.set(0, 0.08, -0.02);
  stinger.rotation.x = -1.2;
  currentParent.add(stinger);

  const legGeo = new THREE.ConeGeometry(0.03, 0.16, 4);
  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    for (const side of [1, -1]) {
      const leg = new THREE.Mesh(legGeo, darkMat);
      addPart(group, leg, [side * 0.18, 0.12, 0.15 - i * 0.2], [Math.PI / 2, 0, (side * Math.PI) / 3]);
      legs.push(leg);
    }
  }

  void prevPos;

  function update(_dt: number, elapsed: number) {
    // Burrow cycle: sink below grade, pause, resurface — sells "briefly
    // untargetable while burrowed" without needing gameplay hookup here.
    const cycle = (elapsed * 0.35) % 1;
    let depth: number;
    if (cycle < 0.55) depth = 0; // surfaced, scuttling
    else if (cycle < 0.7) depth = (cycle - 0.55) / 0.15; // diving
    else if (cycle < 0.85) depth = 1; // fully burrowed
    else depth = 1 - (cycle - 0.85) / 0.15; // resurfacing
    group.position.y = -depth * 0.42 + Math.sin(elapsed * 8) * 0.015 * (1 - depth);
    segments.forEach((s, i) => (s.rotation.z = Math.sin(elapsed * 8 + i) * 0.06));
    claws.forEach((c, i) => (c.rotation.z = Math.sin(elapsed * 4 + i * 2) * 0.2));
    tailParts.forEach((p, i) => {
      p.rotation.x = 0.3 + Math.sin(elapsed * 2 + i * 0.6) * 0.25;
    });
    legs.forEach((l, i) => (l.rotation.z += Math.sin(elapsed * 10 + i) * 0.0001));
  }

  return { group, update };
}

// --- Bosses -----------------------------------------------------------------

function buildCindercolossus(): EnemyModel {
  const group = new THREE.Group();
  const obsidianMat = glowMat(0x3a2418, 0x2a0f04, 0.35, { roughness: 0.55, metalness: 0.25 });
  const lavaMat = glowMat(0xff6a1a, 0xff6a1a, 2.8, { roughness: 0.5 });
  const crackMat = glowMat(0xff8a3c, 0xff8a3c, 2.4, { roughness: 0.45 });

  const torso = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(1.3, 2, 0.16, "cindercolossus-torso"), obsidianMat),
    [0, 1.75, 0],
    [0, 0, 0],
    [1, 1.15, 0.95],
  );
  const core = addPart(
    group,
    new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 16), lavaMat),
    [0, 1.75, 0.05],
  );

  const crackGeo = new THREE.BoxGeometry(0.11, 0.6, 0.11);
  const cracks: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = new THREE.Mesh(crackGeo, crackMat);
    addPart(
      group,
      c,
      [Math.sin(a) * 1.0, 1.75 + Math.cos(i * 1.7) * 0.3, Math.cos(a) * 0.9],
      [0, a, Math.PI / 2.2],
    );
    cracks.push(c);
  }

  const head = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.55, 1, 0.08, "cindercolossus-head"), obsidianMat),
    [0, 3.05, 0.3],
  );
  const eyeGeo = new THREE.BoxGeometry(0.18, 0.06, 0.04);
  addPart(group, new THREE.Mesh(eyeGeo, lavaMat), [0.2, 3.1, 0.75]);
  addPart(group, new THREE.Mesh(eyeGeo, lavaMat), [-0.2, 3.1, 0.75]);

  const hornGeo = baseCone(0.13, 0.65, 5);
  addPart(group, new THREE.Mesh(hornGeo, obsidianMat), [0.32, 3.3, 0.0], [0.4, 0, 0.3]);
  addPart(group, new THREE.Mesh(hornGeo, obsidianMat), [-0.32, 3.3, 0.0], [0.4, 0, -0.3]);

  const armGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.3, 6);
  const armPivots: THREE.Group[] = [];
  const fistMat = obsidianMat;
  for (const x of [1.45, -1.45]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 2.35, 0);
    const arm = new THREE.Mesh(armGeo, obsidianMat);
    arm.rotation.z = Math.sign(x) * 0.15;
    arm.position.y = -0.6;
    pivot.add(arm);
    const fist = new THREE.Mesh(jaggedIcosahedron(0.42, 1, 0.08, `cindercolossus-fist-${x}`), fistMat);
    fist.position.y = -1.3;
    pivot.add(fist);
    group.add(pivot);
    armPivots.push(pivot);
  }

  const legGeo = new THREE.CylinderGeometry(0.42, 0.5, 1.5, 6);
  for (const x of [0.55, -0.55]) {
    addPart(group, new THREE.Mesh(legGeo, obsidianMat), [x, 0.75, 0]);
  }

  const embers = createEmberField(16, 0xff8a3c, 2.0, 3.2, "cindercolossus-embers");
  embers.group.position.y = 0.4;
  group.add(embers.group);

  group.scale.setScalar(1.15);

  function update(dt: number, elapsed: number) {
    group.position.y = Math.sin(elapsed * 0.9) * 0.06;
    group.rotation.z = Math.sin(elapsed * 0.9) * 0.015;
    const heartbeat = 1.7 + Math.pow(Math.max(0, Math.sin(elapsed * 1.3)), 4) * 1.1;
    (core.material as THREE.MeshStandardMaterial).emissiveIntensity = heartbeat;
    for (const c of cracks) (c.material as THREE.MeshStandardMaterial).emissiveIntensity = heartbeat * 0.85;
    core.scale.setScalar(1 + Math.sin(elapsed * 1.3) * 0.04);
    armPivots.forEach((p, i) => (p.rotation.x = Math.sin(elapsed * 0.9 + i * Math.PI) * 0.1));
    head.rotation.y = Math.sin(elapsed * 0.6) * 0.1;
    embers.update(dt, elapsed);
    void torso;
  }

  return { group, update };
}

function buildHollowglacier(): EnemyModel {
  const group = new THREE.Group();
  const iceMat = crystalMat(0xd8f3ff, 0.15, 0.4);
  const cloakMat = glowMat(0x8fd8ff, 0x6fc8ff, 1.1, {
    roughness: 0.25,
    metalness: 0.3,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const eyeMat = glowMat(0x9ff0ff, 0x9ff0ff, 2.6, { roughness: 0.2 });

  const head = addPart(
    group,
    new THREE.Mesh(jaggedIcosahedron(0.55, 1, 0.1, "hollowglacier-head"), iceMat),
    [0, 3.4, 0],
  );
  const eyeGeo = new THREE.BoxGeometry(0.16, 0.05, 0.04);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [0.2, 3.45, 0.48]);
  addPart(group, new THREE.Mesh(eyeGeo, eyeMat), [-0.2, 3.45, 0.48]);

  // Cloak of overlapping jagged shard planes forming the boss's "mantle".
  const cloakShards: THREE.Mesh[] = [];
  const shardGeo = new THREE.ConeGeometry(0.5, 2.2, 4, 1, true);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const shard = new THREE.Mesh(shardGeo, cloakMat);
    addPart(
      group,
      shard,
      [Math.sin(a) * 0.9, 2.1, Math.cos(a) * 0.9],
      [Math.PI, 0, 0],
      [0.55 + (i % 3) * 0.1, 1 + (i % 2) * 0.2, 0.55 + (i % 3) * 0.1],
    );
    cloakShards.push(shard);
  }

  // Hanging icicle "robe" beneath the cloak.
  const icicleGeo = baseCone(0.11, 0.7, 5);
  const icicles: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const icicle = new THREE.Mesh(icicleGeo, iceMat);
    addPart(group, icicle, [Math.sin(a) * 0.55, 1.2, Math.cos(a) * 0.55], [Math.PI, 0, 0]);
    icicles.push(icicle);
  }

  // Trailing mist tendrils.
  const tendrils: THREE.Group[] = [];
  for (const side of [1, -1, 0]) {
    const tendril = new THREE.Group();
    tendril.position.set(side * 0.7, 1.8, -0.6);
    let parent: THREE.Object3D = tendril;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, -0.4, side === 0 ? -0.1 : 0);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.03, 6, 6), cloakMat);
      seg.add(mesh);
      parent.add(seg);
      parent = seg;
    }
    group.add(tendril);
    tendrils.push(tendril);
  }

  const frost = createEmberField(14, 0xbfefff, 2.2, 2.6, "hollowglacier-frost");
  frost.group.position.y = 0.6;
  group.add(frost.group);

  group.scale.setScalar(1.05);

  function update(dt: number, elapsed: number) {
    group.position.y = 0.6 + Math.sin(elapsed * 0.9) * 0.18;
    group.rotation.y = Math.sin(elapsed * 0.4) * 0.2;
    head.rotation.z = Math.sin(elapsed * 0.7) * 0.05;
    cloakShards.forEach((s, i) => {
      const m = s.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.7 + Math.sin(elapsed * 2 + i * 0.7) * 0.6;
      s.rotation.y = Math.sin(elapsed * 0.6 + i) * 0.08;
    });
    icicles.forEach((ic, i) => (ic.rotation.x = Math.PI + Math.sin(elapsed * 1.5 + i) * 0.05));
    tendrils.forEach((t, i) => {
      t.rotation.z = Math.sin(elapsed * 1.1 + i * 2) * 0.3;
      t.children.forEach((seg, j) => {
        (seg as THREE.Group).rotation.x = Math.sin(elapsed * 1.6 + i + j) * 0.4;
      });
    });
    frost.update(dt, elapsed);
  }

  return { group, update };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BUILDERS: Record<string, () => EnemyModel> = {
  thornling: buildThornling,
  cragback: buildCragback,
  skitterwing: buildSkitterwing,
  voltling: buildVoltling,
  frostfang: buildFrostfang,
  cinderling: buildCinderling,
  quagbrute: buildQuagbrute,
  sandveil: buildSandveil,
  cindercolossus: buildCindercolossus,
  hollowglacier: buildHollowglacier,
};

/** Builds a fresh, independently-animatable model for the given enemy
 * `modelId` (see EnemyRegistry.ts). Throws for an unknown id. */
export function createEnemyModel(enemyId: string): EnemyModel {
  const builder = BUILDERS[enemyId];
  if (!builder) throw new Error(`No enemy model registered for id: ${enemyId}`);
  return builder();
}

export const ENEMY_MODEL_IDS: string[] = Object.keys(BUILDERS);
