import * as THREE from "three";
import { createElementCoreMaterial } from "@/game/towers/shaders/coreMaterial";
import { createStructureMaterial } from "@/game/towers/shaders/structureMaterial";
import { applyMotion } from "./motion";
import { crystalShard, flameLick, glyphRing, obelisk, plinth, ringBand, roughRock, spiralTube } from "./primitives";

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Ember Spire — fire base tower. Charred rock pedestal banded with a metal
 * collar, a rune pillar, and a bundle of flame licks over a ring of embers
 * already resting at the base — the ring grows and starts orbiting overhead
 * at higher tiers instead of only appearing there.
 */
export function buildFireTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("fire", "stone", tier);
  const metal = createStructureMaterial("fire", "metal", tier);
  const core = createElementCoreMaterial("fire", tier, { scale: 2.2 });

  const baseR = 0.66 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.32, tier), stone));
  base.scale.y = 0.44;
  base.position.y = 0.19;
  group.add(base);

  const collar = shadowed(new THREE.Mesh(ringBand(baseR * 0.86, 0.045, 6, 20), metal));
  collar.position.y = 0.3;
  group.add(collar);

  const pillarHeight = 0.85 + tier * 0.17;
  const pillar = shadowed(new THREE.Mesh(plinth(0.17, 0.26, pillarHeight, 8), metal));
  pillar.position.y = 0.32 + pillarHeight / 2;
  group.add(pillar);

  // Grounded ember cluster around the base rim — present from tier 1 so the
  // pedestal already reads as "burning all over" instead of only the flame
  // tuft at the very top carrying the whole read.
  const groundEmberCount = 3 + (tier - 1) * 2;
  const groundEmberGeo = roughRock(0.065, 0, 0.4);
  for (let i = 0; i < groundEmberCount; i++) {
    const ember = new THREE.Mesh(groundEmberGeo, core);
    const a = (i / groundEmberCount) * Math.PI * 2 + 0.4;
    const r = baseR * 0.82;
    ember.position.set(Math.cos(a) * r, 0.24, Math.sin(a) * r);
    applyMotion(ember, { bobAmp: 0.03, bobSpeed: 1.4 + i * 0.2, bobPhase: i * 1.1 });
    group.add(ember);
  }

  const flameBaseY = 0.36 + pillarHeight;
  const flameCount = tier + 3;
  for (let i = 0; i < flameCount; i++) {
    const a = (i / flameCount) * Math.PI * 2;
    const r = 0.1 + (i % 2) * 0.07;
    const h = 0.55 + tier * 0.2 - (i % 2) * 0.12;
    const flame = new THREE.Mesh(flameLick(0.18 - i * 0.005, h), core);
    flame.position.set(Math.cos(a) * r, flameBaseY, Math.sin(a) * r);
    applyMotion(flame, { bobAmp: 0.045, bobSpeed: 3 + i * 0.4, bobPhase: i });
    group.add(flame);
  }

  const mainFlame = new THREE.Mesh(flameLick(0.26 + tier * 0.03, 0.9 + tier * 0.28), core);
  mainFlame.position.y = flameBaseY + 0.06;
  applyMotion(mainFlame, { bobAmp: 0.05, bobSpeed: 2.2 });
  group.add(mainFlame);

  if (tier >= 2) {
    // Higher tiers add a *second*, elevated ring that actually orbits —
    // keeps the tier-1 ring (grounded, static) legibly simpler than the
    // tier-2/3 read (grounded ring + spinning embers overhead).
    const emberCount = tier === 2 ? 5 : 8;
    const emberGeo = roughRock(0.055, 0, 0.4);
    for (let i = 0; i < emberCount; i++) {
      const ember = new THREE.Mesh(emberGeo, core);
      const a = (i / emberCount) * Math.PI * 2;
      const r = 0.6 + (tier - 1) * 0.16;
      ember.position.set(Math.cos(a) * r, flameBaseY - 0.1, Math.sin(a) * r);
      applyMotion(ember, { spinSpeed: 0.9, bobAmp: 0.06, bobSpeed: 1.6 + i * 0.2, bobPhase: i * 1.3 });
      group.add(ember);
    }
  }
  return group;
}

/** Frost Pillar — ice base tower. Hexagonal ice slab, a tall central crystal, and a fan of glowing shards. */
export function buildIceTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const crystalMat = createStructureMaterial("ice", "crystal", tier);
  const core = createElementCoreMaterial("ice", tier, { scale: 1.8 });

  const baseR = 0.66 + tier * 0.04;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.09, 0.34, 6), crystalMat));
  base.position.y = 0.17;
  group.add(base);

  const centerH = 1.15 + tier * 0.4;
  const centerOuter = shadowed(new THREE.Mesh(crystalShard(0.32, centerH, 6), crystalMat));
  centerOuter.position.y = 0.34;
  group.add(centerOuter);

  const centerInner = new THREE.Mesh(crystalShard(0.19, centerH * 0.9, 6), core);
  centerInner.position.y = 0.34;
  centerInner.scale.set(0.92, 0.92, 0.92);
  applyMotion(centerInner, { spinSpeed: 0.3 });
  group.add(centerInner);

  // Low ring of stout ground-level crystal knuckles, distinct from (and
  // beneath) the taller fan of shards below — widens the footprint so the
  // tower reads as a cluster, not a single spike on a disc.
  const knuckleCount = 3 + tier;
  for (let i = 0; i < knuckleCount; i++) {
    const a = (i / knuckleCount) * Math.PI * 2 + 0.5;
    const knuckle = shadowed(new THREE.Mesh(crystalShard(0.1, 0.22 + (i % 2) * 0.06, 5), crystalMat));
    knuckle.position.set(Math.cos(a) * baseR * 0.78, 0.2, Math.sin(a) * baseR * 0.78);
    group.add(knuckle);
  }

  const shardCount = tier + 3;
  for (let i = 0; i < shardCount; i++) {
    const a = (i / shardCount) * Math.PI * 2;
    const h = 0.42 + (i % 3) * 0.16 + tier * 0.08;
    const outer = shadowed(new THREE.Mesh(crystalShard(0.11, h, 5), crystalMat));
    const r = 0.52 + (i % 2) * 0.14;
    outer.position.set(Math.cos(a) * r, 0.32, Math.sin(a) * r);
    outer.rotation.z = Math.cos(a) * 0.35;
    outer.rotation.x = -Math.sin(a) * 0.35;
    group.add(outer);

    const inner = new THREE.Mesh(crystalShard(0.06, h * 0.88, 5), core);
    inner.position.copy(outer.position);
    inner.rotation.copy(outer.rotation);
    inner.scale.set(0.9, 0.9, 0.9);
    applyMotion(inner, { bobAmp: 0.02, bobSpeed: 2 + i * 0.3, bobPhase: i });
    group.add(inner);
  }
  return group;
}

/** Storm Conduit — lightning base tower. Coil-wound mast topped with a crackling orb; more coils and spikes per tier. */
export function buildLightningTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const metal = createStructureMaterial("lightning", "metal", tier);
  const core = createElementCoreMaterial("lightning", tier, { scale: 3.4 });

  const baseR = 0.5 + tier * 0.04;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.19, 0.3, 10), metal));
  base.position.y = 0.15;
  group.add(base);

  // Ring of housing fins around the base — reads as a proper generator
  // housing instead of a bare disc, even before any coils wind the mast.
  const finCount = 5;
  for (let i = 0; i < finCount; i++) {
    const a = (i / finCount) * Math.PI * 2;
    const fin = shadowed(new THREE.Mesh(plinth(0.02, 0.11, 0.36, 3), metal));
    fin.position.set(Math.cos(a) * baseR * 0.92, 0.18, Math.sin(a) * baseR * 0.92);
    fin.rotation.y = -a;
    group.add(fin);
  }

  const mastHeight = 1.1 + tier * 0.32;
  const mast = shadowed(new THREE.Mesh(plinth(0.08, 0.13, mastHeight, 8), metal));
  mast.position.y = 0.3 + mastHeight / 2;
  group.add(mast);

  const coilCount = tier + 1;
  for (let i = 0; i < coilCount; i++) {
    const coilH = mastHeight * 0.72;
    const coil = shadowed(new THREE.Mesh(spiralTube(0.19 - i * 0.02, coilH, 3 + i, 0.03), metal));
    coil.position.y = 0.3;
    group.add(coil);
  }

  const orbY = 0.34 + mastHeight;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21 + tier * 0.035, 1), core);
  orb.position.y = orbY;
  applyMotion(orb, { spinSpeed: 1.4, bobAmp: 0.04, bobSpeed: 4 });
  group.add(orb);

  const spikeCount = 3 + tier;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2;
    const spike = shadowed(new THREE.Mesh(plinth(0.006, 0.035, 0.32 + tier * 0.06, 5), metal));
    spike.position.set(Math.cos(a) * 0.2, orbY, Math.sin(a) * 0.2);
    spike.rotation.z = Math.cos(a) * 1.15;
    spike.rotation.x = -Math.sin(a) * 1.15;
    group.add(spike);

    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), core);
    tip.position.set(Math.cos(a) * 0.36, orbY + 0.14, Math.sin(a) * 0.36);
    applyMotion(tip, { bobAmp: 0.03, bobSpeed: 6 + i, bobPhase: i * 2 });
    group.add(tip);
  }
  return group;
}

/** Thornroot Totem — nature base tower. A living trunk wrapped in a glowing vine, crowned with thorned canopy. */
export function buildNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const core = createElementCoreMaterial("nature", tier, { scale: 2.6 });

  const baseR = 0.6 + tier * 0.05;
  const rootBase = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.4, tier + 1), wood));
  rootBase.scale.y = 0.38;
  rootBase.position.y = 0.15;
  group.add(rootBase);

  // Buttress roots flaring out from the trunk base — grounds the totem with
  // real width instead of the trunk planting straight into a bare mound.
  const rootCount = 4;
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + 0.3;
    const root = shadowed(new THREE.Mesh(roughRock(0.14, 0, 0.5, i + 2), wood));
    root.scale.set(1.6, 0.5, 0.9);
    root.position.set(Math.cos(a) * baseR * 0.75, 0.16, Math.sin(a) * baseR * 0.75);
    root.rotation.y = -a;
    group.add(root);
  }

  const trunkHeight = 1.05 + tier * 0.32;
  const trunk = shadowed(new THREE.Mesh(plinth(0.17, 0.26, trunkHeight, 7), wood));
  trunk.position.y = 0.3 + trunkHeight / 2;
  group.add(trunk);

  const vine = new THREE.Mesh(spiralTube(0.24, trunkHeight * 0.95, 2 + tier * 0.4, 0.06), core);
  vine.position.y = 0.32;
  applyMotion(vine, { spinSpeed: 0.15 });
  group.add(vine);

  const canopyY = 0.34 + trunkHeight;
  const leafCount = 4 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.15 + (i % 2) * 0.04, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.5, 1);
    const r = 0.24 + (i % 2) * 0.1;
    leaf.position.set(Math.cos(a) * r, canopyY + (i % 2) * 0.09, Math.sin(a) * r);
    group.add(leaf);
  }

  const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + tier * 0.025, 1), core);
  seed.position.y = canopyY + 0.2;
  applyMotion(seed, { spinSpeed: 0.6, bobAmp: 0.05, bobSpeed: 1.6 });
  group.add(seed);

  // Thorns already sprout from tier 1 (a light fringe), then thicken —
  // instead of appearing out of nowhere at tier 2.
  const thornCount = 3 + (tier - 1) * 3;
  for (let i = 0; i < thornCount; i++) {
    const a = (i / thornCount) * Math.PI * 2 + 0.3;
    const thorn = shadowed(new THREE.Mesh(plinth(0.005, 0.035, 0.22, 5), wood));
    thorn.position.set(Math.cos(a) * 0.24, canopyY - 0.1, Math.sin(a) * 0.24);
    thorn.rotation.z = Math.cos(a) * 1.2;
    thorn.rotation.x = -Math.sin(a) * 1.2;
    group.add(thorn);
  }
  return group;
}

/** Stonewarden — earth base tower. Stacked boulders with a glowing crack shell that widens with tier. */
export function buildEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const core = createElementCoreMaterial("earth", tier, { scale: 2.0 });

  const baseR = 0.72 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, 5), stone));
  base.scale.y = 0.42;
  base.position.y = 0.2;
  group.add(base);

  // Rubble skirt resting on the ground around the base — present from
  // tier 1, so the plinth already reads as a rockslide, not a bare mound.
  const rubbleCount = 3 + (tier - 1) * 2;
  for (let i = 0; i < rubbleCount; i++) {
    const a = (i / rubbleCount) * Math.PI * 2 + 0.6;
    const rubble = shadowed(new THREE.Mesh(roughRock(0.13, 0, 0.5, i + 6), stone));
    rubble.position.set(Math.cos(a) * baseR * 0.82, 0.14, Math.sin(a) * baseR * 0.82);
    group.add(rubble);
    const crack = new THREE.Mesh(roughRock(0.13 * 1.05, 0, 0.5, i + 6), core);
    crack.position.copy(rubble.position);
    group.add(crack);
  }

  const boulderCount = tier + 1;
  let y = 0.38;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.48 - i * 0.09;
    const geo = roughRock(r, 1, 0.3, i * 3.1);
    const boulder = shadowed(new THREE.Mesh(geo, stone));
    boulder.position.y = y + r * 0.7;
    group.add(boulder);

    const shell = new THREE.Mesh(roughRock(r * 1.015, 1, 0.3, i * 3.1), core);
    shell.position.copy(boulder.position);
    group.add(shell);

    y += r * 1.25;
  }

  if (tier >= 2) {
    const orbitCount = tier === 2 ? 2 : 4;
    for (let i = 0; i < orbitCount; i++) {
      const a = (i / orbitCount) * Math.PI * 2;
      const chunk = shadowed(new THREE.Mesh(roughRock(0.1, 0, 0.4, i + 5), stone));
      const holder = new THREE.Group();
      holder.position.set(0, y * 0.55, 0);
      chunk.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      holder.add(chunk);
      applyMotion(holder, { spinSpeed: 0.35 + i * 0.05 });
      group.add(holder);
    }
  }
  return group;
}

/** Rune Obelisk — arcane base tower. A hovering obelisk ringed by rotating glyph plates. */
export function buildArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const core = createElementCoreMaterial("arcane", tier, { scale: 1.4 });

  const discR = 0.62 + tier * 0.03;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.88, 0.16, 8), crystalMat));
  disc.position.y = 0.34;
  applyMotion(disc, { bobAmp: 0.03, bobSpeed: 1.1 });
  group.add(disc);

  // Small crystal moorings hovering just under the disc's rim — break up
  // the perfectly flat disc silhouette and hint at the floating physics
  // even before any glyph ring exists.
  const moorCount = 4;
  for (let i = 0; i < moorCount; i++) {
    const a = (i / moorCount) * Math.PI * 2 + 0.4;
    const moor = shadowed(new THREE.Mesh(crystalShard(0.06, 0.22, 5), crystalMat));
    moor.position.set(Math.cos(a) * discR * 0.86, 0.2, Math.sin(a) * discR * 0.86);
    moor.rotation.x = Math.PI;
    applyMotion(moor, { bobAmp: 0.025, bobSpeed: 1.3 + i * 0.15, bobPhase: i * 1.4 });
    group.add(moor);
  }

  const obeliskHeight = 1.15 + tier * 0.36;
  const pillar = shadowed(new THREE.Mesh(obelisk(0.065, 0.22, obeliskHeight), crystalMat));
  pillar.position.y = 0.34 + obeliskHeight / 2;
  group.add(pillar);

  const glowCore = new THREE.Mesh(obelisk(0.026, 0.12, obeliskHeight * 0.94), core);
  glowCore.position.copy(pillar.position);
  applyMotion(glowCore, { spinSpeed: 0.5 });
  group.add(glowCore);

  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.46 + i * 0.17, 5 + i * 2, 0.13, core);
    ring.position.y = 0.54 + i * 0.34;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.4 + i * 0.1), bobAmp: 0.04, bobSpeed: 1.3 + i * 0.2 });
    group.add(ring);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + tier * 0.025, 1), core);
  orb.position.y = 0.44 + obeliskHeight;
  applyMotion(orb, { spinSpeed: 0.8, bobAmp: 0.06, bobSpeed: 1.8 });
  group.add(orb);

  return group;
}
