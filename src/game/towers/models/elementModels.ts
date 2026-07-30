import * as THREE from "three";
import { createElementCoreMaterial } from "@/game/towers/shaders/coreMaterial";
import { createStructureMaterial } from "@/game/towers/shaders/structureMaterial";
import { applyMotion } from "./motion";
import { crystalShard, flameLick, glyphRing, obelisk, plinth, roughRock, spiralTube } from "./primitives";

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Ember Spire — fire base tower. Charred rock pedestal, a rune pillar, and a bundle of flame licks that grows fiercer per tier. */
export function buildFireTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("fire", "stone", tier);
  const metal = createStructureMaterial("fire", "metal", tier);
  const core = createElementCoreMaterial("fire", tier, { scale: 2.2 });

  const base = shadowed(new THREE.Mesh(roughRock(0.55, 1, 0.32, tier), stone));
  base.scale.y = 0.42;
  base.position.y = 0.16;
  group.add(base);

  const pillarHeight = 0.55 + tier * 0.12;
  const pillar = shadowed(new THREE.Mesh(plinth(0.16, 0.24, pillarHeight, 8), metal));
  pillar.position.y = 0.3 + pillarHeight / 2;
  group.add(pillar);

  const flameBaseY = 0.35 + pillarHeight;
  const flameCount = tier + 2;
  for (let i = 0; i < flameCount; i++) {
    const a = (i / flameCount) * Math.PI * 2;
    const r = 0.05 + (i % 2) * 0.05;
    const h = 0.5 + tier * 0.18 - (i % 2) * 0.12;
    const flame = new THREE.Mesh(flameLick(0.16 - i * 0.005, h), core);
    flame.position.set(Math.cos(a) * r, flameBaseY, Math.sin(a) * r);
    applyMotion(flame, { bobAmp: 0.04, bobSpeed: 3 + i * 0.4, bobPhase: i });
    group.add(flame);
  }

  const mainFlame = new THREE.Mesh(flameLick(0.22 + tier * 0.02, 0.75 + tier * 0.25), core);
  mainFlame.position.y = flameBaseY + 0.05;
  applyMotion(mainFlame, { bobAmp: 0.05, bobSpeed: 2.2 });
  group.add(mainFlame);

  if (tier >= 2) {
    const emberCount = tier === 2 ? 5 : 8;
    const emberGeo = roughRock(0.05, 0, 0.4);
    for (let i = 0; i < emberCount; i++) {
      const ember = new THREE.Mesh(emberGeo, core);
      const a = (i / emberCount) * Math.PI * 2;
      const r = 0.55 + (tier - 1) * 0.15;
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

  const base = shadowed(new THREE.Mesh(plinth(0.55, 0.6, 0.3, 6), crystalMat));
  base.position.y = 0.15;
  group.add(base);

  const centerH = 0.9 + tier * 0.35;
  const centerOuter = shadowed(new THREE.Mesh(crystalShard(0.26, centerH, 6), crystalMat));
  centerOuter.position.y = 0.32;
  group.add(centerOuter);

  const centerInner = new THREE.Mesh(crystalShard(0.16, centerH * 0.9, 6), core);
  centerInner.position.y = 0.32;
  centerInner.scale.set(0.92, 0.92, 0.92);
  applyMotion(centerInner, { spinSpeed: 0.3 });
  group.add(centerInner);

  const shardCount = tier + 3;
  for (let i = 0; i < shardCount; i++) {
    const a = (i / shardCount) * Math.PI * 2;
    const h = 0.35 + (i % 3) * 0.14 + tier * 0.06;
    const outer = shadowed(new THREE.Mesh(crystalShard(0.09, h, 5), crystalMat));
    const r = 0.42 + (i % 2) * 0.1;
    outer.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
    outer.rotation.z = Math.cos(a) * 0.35;
    outer.rotation.x = -Math.sin(a) * 0.35;
    group.add(outer);

    const inner = new THREE.Mesh(crystalShard(0.05, h * 0.88, 5), core);
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

  const base = shadowed(new THREE.Mesh(plinth(0.42, 0.5, 0.28, 10), metal));
  base.position.y = 0.14;
  group.add(base);

  const mastHeight = 0.9 + tier * 0.28;
  const mast = shadowed(new THREE.Mesh(plinth(0.06, 0.1, mastHeight, 8), metal));
  mast.position.y = 0.28 + mastHeight / 2;
  group.add(mast);

  const coilCount = tier;
  for (let i = 0; i < coilCount; i++) {
    const coilH = mastHeight * 0.7;
    const coil = shadowed(new THREE.Mesh(spiralTube(0.16 - i * 0.02, coilH, 3 + i, 0.025), metal));
    coil.position.y = 0.28;
    group.add(coil);
  }

  const orbY = 0.32 + mastHeight;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + tier * 0.03, 1), core);
  orb.position.y = orbY;
  applyMotion(orb, { spinSpeed: 1.4, bobAmp: 0.04, bobSpeed: 4 });
  group.add(orb);

  const spikeCount = 3 + tier;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2;
    const spike = shadowed(new THREE.Mesh(plinth(0.005, 0.03, 0.28 + tier * 0.05, 5), metal));
    spike.position.set(Math.cos(a) * 0.18, orbY, Math.sin(a) * 0.18);
    spike.rotation.z = Math.cos(a) * 1.15;
    spike.rotation.x = -Math.sin(a) * 1.15;
    group.add(spike);

    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), core);
    tip.position.set(Math.cos(a) * 0.32, orbY + 0.12, Math.sin(a) * 0.32);
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

  const rootBase = shadowed(new THREE.Mesh(roughRock(0.5, 1, 0.4, tier + 1), wood));
  rootBase.scale.y = 0.36;
  rootBase.position.y = 0.14;
  group.add(rootBase);

  const trunkHeight = 0.85 + tier * 0.3;
  const trunk = shadowed(new THREE.Mesh(plinth(0.14, 0.22, trunkHeight, 7), wood));
  trunk.position.y = 0.28 + trunkHeight / 2;
  group.add(trunk);

  const vine = new THREE.Mesh(spiralTube(0.2, trunkHeight * 0.95, 2 + tier * 0.4, 0.055), core);
  vine.position.y = 0.3;
  applyMotion(vine, { spinSpeed: 0.15 });
  group.add(vine);

  const canopyY = 0.32 + trunkHeight;
  const leafCount = 4 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.12 + (i % 2) * 0.03, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.5, 1);
    const r = 0.18 + (i % 2) * 0.08;
    leaf.position.set(Math.cos(a) * r, canopyY + (i % 2) * 0.08, Math.sin(a) * r);
    group.add(leaf);
  }

  const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 + tier * 0.02, 1), core);
  seed.position.y = canopyY + 0.18;
  applyMotion(seed, { spinSpeed: 0.6, bobAmp: 0.05, bobSpeed: 1.6 });
  group.add(seed);

  if (tier >= 2) {
    const thornCount = tier === 2 ? 4 : 7;
    for (let i = 0; i < thornCount; i++) {
      const a = (i / thornCount) * Math.PI * 2 + 0.3;
      const thorn = shadowed(new THREE.Mesh(plinth(0.005, 0.035, 0.22, 5), wood));
      thorn.position.set(Math.cos(a) * 0.24, canopyY - 0.1, Math.sin(a) * 0.24);
      thorn.rotation.z = Math.cos(a) * 1.2;
      thorn.rotation.x = -Math.sin(a) * 1.2;
      group.add(thorn);
    }
  }
  return group;
}

/** Stonewarden — earth base tower. Stacked boulders with a glowing crack shell that widens with tier. */
export function buildEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const core = createElementCoreMaterial("earth", tier, { scale: 2.0 });

  const base = shadowed(new THREE.Mesh(roughRock(0.62, 1, 0.3, 5), stone));
  base.scale.y = 0.4;
  base.position.y = 0.18;
  group.add(base);

  const boulderCount = tier + 1;
  let y = 0.34;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.4 - i * 0.09;
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

  const disc = shadowed(new THREE.Mesh(plinth(0.5, 0.44, 0.14, 8), crystalMat));
  disc.position.y = 0.32;
  applyMotion(disc, { bobAmp: 0.03, bobSpeed: 1.1 });
  group.add(disc);

  const obeliskHeight = 0.95 + tier * 0.32;
  const pillar = shadowed(new THREE.Mesh(obelisk(0.05, 0.18, obeliskHeight), crystalMat));
  pillar.position.y = 0.32 + obeliskHeight / 2;
  group.add(pillar);

  const glowCore = new THREE.Mesh(obelisk(0.02, 0.1, obeliskHeight * 0.94), core);
  glowCore.position.copy(pillar.position);
  applyMotion(glowCore, { spinSpeed: 0.5 });
  group.add(glowCore);

  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.42 + i * 0.16, 5 + i * 2, 0.11, core);
    ring.position.y = 0.5 + i * 0.32;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.4 + i * 0.1), bobAmp: 0.04, bobSpeed: 1.3 + i * 0.2 });
    group.add(ring);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + tier * 0.02, 1), core);
  orb.position.y = 0.4 + obeliskHeight;
  applyMotion(orb, { spinSpeed: 0.8, bobAmp: 0.06, bobSpeed: 1.8 });
  group.add(orb);

  return group;
}
