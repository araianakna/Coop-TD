import * as THREE from "three";
import { createElementCoreMaterial } from "@/game/towers/shaders/coreMaterial";
import { createStructureMaterial } from "@/game/towers/shaders/structureMaterial";
import { applyMotion } from "./motion";
import {
  crystalShard,
  flameLick,
  glyphRing,
  obelisk as obeliskGeo,
  plinth,
  ringBand,
  roughRock,
  spiralTube,
} from "./primitives";

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Steamcaller — fire + ice. An ice-crystal base venting a superheated core; rising steam puffs mark the boundary. */
export function buildFireIceTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.4 });
  const iceCoreMat = createElementCoreMaterial("ice", tier, { scale: 1.6, intensity: 1.2 });

  const baseR = 0.66 + tier * 0.04;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.09, 0.4, 6), iceCrystal));
  base.position.y = 0.2;
  group.add(base);

  const rim = shadowed(new THREE.Mesh(ringBand(baseR * 1.12, 0.05, 6, 20), iceCrystal));
  rim.position.y = 0.06;
  group.add(rim);

  // Crystal shell is deliberately short (60% of the total height) so the
  // flame vent rises clearly above its open top instead of hiding inside
  // solid opaque geometry.
  const towerH = 0.95 + tier * 0.32;
  const shellH = towerH * 0.62;
  const vent = shadowed(new THREE.Mesh(crystalShard(0.36, shellH, 6), iceCrystal));
  vent.position.y = 0.4;
  group.add(vent);

  const ventCore = new THREE.Mesh(flameLick(0.21 + tier * 0.03, towerH * 0.75), fireCore);
  ventCore.position.y = 0.4 + shellH + towerH * 0.22;
  applyMotion(ventCore, { bobAmp: 0.05, bobSpeed: 3.2 });
  group.add(ventCore);

  const puffCount = tier + 2;
  for (let i = 0; i < puffCount; i++) {
    const a = (i / puffCount) * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + (i % 2) * 0.03, 0), iceCoreMat);
    puff.position.set(Math.cos(a) * 0.36, 0.4 + shellH + i * 0.1, Math.sin(a) * 0.36);
    applyMotion(puff, { bobAmp: 0.09, bobSpeed: 1.1 + i * 0.2, bobPhase: i * 1.5, spinSpeed: 0.4 });
    group.add(puff);
  }
  return group;
}

/** Plasma Arc — fire + lightning. A tesla mast cradling a superheated plasma orb. */
export function buildFireLightningTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const metal = createStructureMaterial("lightning", "metal", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.6 });
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.6, intensity: 1.6 });

  const baseR = 0.54 + tier * 0.04;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.15, 0.34, 10), metal));
  base.position.y = 0.17;
  group.add(base);

  const mastH = 0.8 + tier * 0.26;
  const mast = shadowed(new THREE.Mesh(plinth(0.09, 0.13, mastH, 8), metal));
  mast.position.y = 0.34 + mastH / 2;
  group.add(mast);

  const cageY = 0.4 + mastH;
  const spikeCount = 4 + tier;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2;
    const spike = shadowed(new THREE.Mesh(plinth(0.006, 0.03, 0.34, 5), metal));
    spike.position.set(Math.cos(a) * 0.18, cageY, Math.sin(a) * 0.18);
    spike.rotation.z = Math.cos(a) * 1.1;
    spike.rotation.x = -Math.sin(a) * 1.1;
    group.add(spike);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + tier * 0.035, 1), fireCore);
  orb.position.y = cageY;
  applyMotion(orb, { bobAmp: 0.03, bobSpeed: 3 });
  group.add(orb);

  const arcRing = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27 + tier * 0.045, 1), boltCore);
  arcRing.position.y = cageY;
  applyMotion(arcRing, { spinSpeed: 1.6 });
  group.add(arcRing);

  for (let i = 0; i < tier + 1; i++) {
    const tip = new THREE.Mesh(flameLick(0.06, 0.22), fireCore);
    tip.position.set(0.24, cageY - 0.05 + i * 0.16, 0);
    tip.rotation.z = -Math.PI / 2.4;
    applyMotion(tip, { spinSpeed: 0.9, bobAmp: 0.02, bobSpeed: 4 + i, bobPhase: i * 2 });
    group.add(tip);
  }
  return group;
}

/** Wildfire Warden — fire + nature. A burning living trunk with vines of fire and ember-tipped thorns. */
export function buildFireNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.4 });

  const baseR = 0.64 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.38, tier), wood));
  base.scale.y = 0.38;
  base.position.y = 0.16;
  group.add(base);

  // Smouldering root chunks resting at the base, present from tier 1.
  const rootEmberCount = 3;
  for (let i = 0; i < rootEmberCount; i++) {
    const a = (i / rootEmberCount) * Math.PI * 2 + 0.5;
    const ember = new THREE.Mesh(roughRock(0.07, 0, 0.4, i + 3), fireCore);
    ember.position.set(Math.cos(a) * baseR * 1.05, 0.2, Math.sin(a) * baseR * 1.05);
    applyMotion(ember, { bobAmp: 0.03, bobSpeed: 1.6 + i * 0.2, bobPhase: i });
    group.add(ember);
  }

  const trunkH = 1.0 + tier * 0.32;
  const trunk = shadowed(new THREE.Mesh(plinth(0.17, 0.25, trunkH, 7), wood));
  trunk.position.y = 0.32 + trunkH / 2;
  group.add(trunk);

  const vine = new THREE.Mesh(spiralTube(0.24, trunkH * 0.95, 2 + tier * 0.4, 0.06), fireCore);
  vine.position.y = 0.34;
  applyMotion(vine, { spinSpeed: -0.2 });
  group.add(vine);

  const crownY = 0.36 + trunkH;
  const flameCount = 3 + tier * 2;
  for (let i = 0; i < flameCount; i++) {
    const a = (i / flameCount) * Math.PI * 2;
    const flame = new THREE.Mesh(flameLick(0.11, 0.34 + tier * 0.07), fireCore);
    flame.position.set(Math.cos(a) * 0.26, crownY, Math.sin(a) * 0.26);
    applyMotion(flame, { bobAmp: 0.04, bobSpeed: 3 + i * 0.3, bobPhase: i });
    group.add(flame);
  }

  const core = new THREE.Mesh(flameLick(0.2 + tier * 0.035, 0.62 + tier * 0.18), fireCore);
  core.position.y = crownY + 0.1;
  applyMotion(core, { bobAmp: 0.05, bobSpeed: 2.4 });
  group.add(core);
  return group;
}

/** Magma Forge — fire + earth. A molten-veined boulder totem, its crack shell burning instead of merely glowing amber. */
export function buildFireEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.1 });

  const baseR = 0.74 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.32, tier), stone));
  base.scale.y = 0.44;
  base.position.y = 0.2;
  group.add(base);

  // Molten droplets pooled at the base rim, present from tier 1.
  const dropletCount = 3;
  for (let i = 0; i < dropletCount; i++) {
    const a = (i / dropletCount) * Math.PI * 2 + 0.5;
    const droplet = new THREE.Mesh(roughRock(0.07, 0, 0.4, i + 4), fireCore);
    droplet.position.set(Math.cos(a) * baseR * 1.05, 0.16, Math.sin(a) * baseR * 1.05);
    applyMotion(droplet, { bobAmp: 0.025, bobSpeed: 1.3 + i * 0.2, bobPhase: i });
    group.add(droplet);
  }

  const boulderCount = tier + 1;
  let y = 0.38;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.5 - i * 0.09;
    const geo = roughRock(r, 1, 0.32, i * 2.7);
    const boulder = shadowed(new THREE.Mesh(geo, stone));
    boulder.position.y = y + r * 0.7;
    group.add(boulder);

    const shell = new THREE.Mesh(roughRock(r * 1.02, 1, 0.32, i * 2.7), fireCore);
    shell.position.copy(boulder.position);
    group.add(shell);
    y += r * 1.25;
  }

  const ventTop = new THREE.Mesh(flameLick(0.18 + tier * 0.025, 0.48 + tier * 0.15), fireCore);
  ventTop.position.y = y + 0.06;
  applyMotion(ventTop, { bobAmp: 0.04, bobSpeed: 2.6 });
  group.add(ventTop);
  return group;
}

/** Hellfire Sigil — fire + arcane. A blackened obelisk inscribed with burning glyphs around a captive flame core. */
export function buildFireArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.2 });

  const discR = 0.58 + tier * 0.03;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.88, 0.16, 8), crystalMat));
  disc.position.y = 0.32;
  applyMotion(disc, { bobAmp: 0.03, bobSpeed: 1 });
  group.add(disc);

  // Embers smouldering at the disc rim, present from tier 1.
  const emberCount = 3;
  for (let i = 0; i < emberCount; i++) {
    const a = (i / emberCount) * Math.PI * 2 + 0.6;
    const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), fireCore);
    ember.position.set(Math.cos(a) * discR * 0.85, 0.2, Math.sin(a) * discR * 0.85);
    applyMotion(ember, { bobAmp: 0.03, bobSpeed: 1.6 + i * 0.2, bobPhase: i });
    group.add(ember);
  }

  const obeliskH = 1.1 + tier * 0.36;
  const pillar = shadowed(new THREE.Mesh(obeliskGeo(0.065, 0.22, obeliskH), crystalMat));
  pillar.position.y = 0.32 + obeliskH / 2;
  group.add(pillar);

  const flameCoreMesh = new THREE.Mesh(obeliskGeo(0.026, 0.12, obeliskH * 0.94), fireCore);
  flameCoreMesh.position.copy(pillar.position);
  applyMotion(flameCoreMesh, { spinSpeed: 0.4 });
  group.add(flameCoreMesh);

  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.44 + i * 0.17, 5 + i * 2, 0.17, fireCore);
    ring.position.y = 0.52 + i * 0.32;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.1), bobAmp: 0.03, bobSpeed: 1.2 });
    group.add(ring);
  }

  const tip = new THREE.Mesh(flameLick(0.15 + tier * 0.025, 0.48), fireCore);
  tip.position.y = 0.4 + obeliskH;
  applyMotion(tip, { bobAmp: 0.05, bobSpeed: 2.2 });
  group.add(tip);
  return group;
}

/** Frostshock Pylon — ice + lightning. An ice shard cluster with jagged bolts of lightning running through hairline cracks. */
export function buildIceLightningTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.2 });

  const baseR = 0.6 + tier * 0.04;
  const coilBase = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.16, 0.3, 8), metal));
  coilBase.position.y = 0.15;
  group.add(coilBase);
  const coil = shadowed(new THREE.Mesh(spiralTube(0.48, 0.24, 3 + tier, 0.024), metal));
  coil.position.y = 0.16;
  group.add(coil);

  const centerH = 1.05 + tier * 0.36;
  const shard = shadowed(new THREE.Mesh(crystalShard(0.29, centerH, 6), iceCrystal));
  shard.position.y = 0.32;
  group.add(shard);

  const boltShard = new THREE.Mesh(crystalShard(0.17, centerH * 0.85, 6), boltCore);
  boltShard.position.y = 0.32;
  applyMotion(boltShard, { spinSpeed: -0.3 });
  group.add(boltShard);

  const spikeCount = tier + 3;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2;
    const h = 0.36 + (i % 2) * 0.16;
    const spike = shadowed(new THREE.Mesh(crystalShard(0.085, h, 5), iceCrystal));
    spike.position.set(Math.cos(a) * 0.48, 0.3, Math.sin(a) * 0.48);
    spike.rotation.z = Math.cos(a) * 0.4;
    spike.rotation.x = -Math.sin(a) * 0.4;
    group.add(spike);

    const arc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), boltCore);
    arc.position.set(Math.cos(a) * 0.54, 0.3 + h * 0.6, Math.sin(a) * 0.54);
    applyMotion(arc, { bobAmp: 0.02, bobSpeed: 8 + i, bobPhase: i * 3 });
    group.add(arc);
  }
  return group;
}

/** Permafrost Grove — ice + nature. A frozen tree encased in an icy crystal shell, icicles hanging from every branch. */
export function buildIceNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.8 });

  const baseR = 0.62 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), wood));
  base.scale.y = 0.38;
  base.position.y = 0.16;
  group.add(base);

  // Trunk stays wood the full way up — the ice only wraps a mid-height
  // collar band, so both parent elements stay legible instead of the ice
  // shell fully occluding the tree.
  const trunkH = 1.0 + tier * 0.3;
  const trunk = shadowed(new THREE.Mesh(plinth(0.13, 0.23, trunkH, 7), wood));
  trunk.position.y = 0.32 + trunkH / 2;
  group.add(trunk);

  const collarH = trunkH * 0.4;
  const collar = shadowed(new THREE.Mesh(plinth(0.19, 0.23, collarH, 7), iceCrystal));
  collar.position.y = 0.34 + trunkH * 0.32;
  group.add(collar);

  const canopyY = 0.36 + trunkH;
  const leafCount = 3 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.13, 0, 0.3, i), wood));
    leaf.scale.set(1.3, 0.45, 1);
    const r = 0.22 + (i % 2) * 0.09;
    leaf.position.set(Math.cos(a) * r, canopyY + (i % 2) * 0.07, Math.sin(a) * r);
    group.add(leaf);

    const icicle = shadowed(new THREE.Mesh(crystalShard(0.055, 0.2 + (i % 2) * 0.1, 5), iceCrystal));
    icicle.position.set(Math.cos(a) * r, canopyY - 0.04, Math.sin(a) * r);
    icicle.rotation.x = Math.PI;
    group.add(icicle);
  }

  const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + tier * 0.025, 1), iceCore);
  seed.position.y = canopyY + 0.18;
  applyMotion(seed, { spinSpeed: 0.5, bobAmp: 0.04, bobSpeed: 1.5 });
  group.add(seed);
  return group;
}

/** Glacier Bastion — ice + earth. A stacked rampart of interlocking rock and ice slabs, cracks glowing pale blue. */
export function buildIceEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.7 });

  const baseR = 0.72 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.28, tier), stone));
  base.scale.y = 0.4;
  base.position.y = 0.18;
  group.add(base);

  const chunkCount = tier + 2;
  let y = 0.32;
  for (let i = 0; i < chunkCount; i++) {
    const r = 0.44 - i * 0.05;
    const isIce = i % 2 === 1;
    const mat = isIce ? iceCrystal : stone;
    const geo = isIce ? crystalShard(r, r * 1.6, 6) : roughRock(r, 1, 0.28, i * 2);
    const chunk = shadowed(new THREE.Mesh(geo, mat));
    chunk.position.y = y + r * 0.6;
    group.add(chunk);

    if (!isIce) {
      const cracks = new THREE.Mesh(roughRock(r * 1.02, 1, 0.28, i * 2), iceCore);
      cracks.position.copy(chunk.position);
      group.add(cracks);
    }
    y += r * 1.1;
  }
  return group;
}

/** Frostweave Loom — ice + arcane. A floating obelisk woven from interlaced ice-blue crystal threads. */
export function buildIceArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const crystalMat = createStructureMaterial("ice", "crystal", tier);
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.6 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.5, intensity: 1.3 });

  const discR = 0.56 + tier * 0.03;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.87, 0.16, 8), crystalMat));
  disc.position.y = 0.32;
  applyMotion(disc, { bobAmp: 0.03, bobSpeed: 1 });
  group.add(disc);

  // Small crystal moorings hovering under the disc rim, present from tier 1.
  const moorCount = 4;
  for (let i = 0; i < moorCount; i++) {
    const a = (i / moorCount) * Math.PI * 2 + 0.4;
    const moor = shadowed(new THREE.Mesh(crystalShard(0.055, 0.2, 5), crystalMat));
    moor.position.set(Math.cos(a) * discR * 0.85, 0.2, Math.sin(a) * discR * 0.85);
    moor.rotation.x = Math.PI;
    applyMotion(moor, { bobAmp: 0.02, bobSpeed: 1.3 + i * 0.15, bobPhase: i * 1.3 });
    group.add(moor);
  }

  const obeliskH = 1.1 + tier * 0.36;
  const pillar = shadowed(new THREE.Mesh(obeliskGeo(0.058, 0.2, obeliskH), crystalMat));
  pillar.position.y = 0.32 + obeliskH / 2;
  group.add(pillar);

  const glow = new THREE.Mesh(obeliskGeo(0.022, 0.11, obeliskH * 0.94), iceCore);
  glow.position.copy(pillar.position);
  applyMotion(glow, { spinSpeed: 0.4 });
  group.add(glow);

  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const mat = i % 2 === 0 ? iceCore : arcaneCore;
    const ring = glyphRing(0.44 + i * 0.17, 5 + i * 2, 0.17, mat);
    ring.position.y = 0.52 + i * 0.32;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.4 + i * 0.1), bobAmp: 0.03, bobSpeed: 1.2 });
    group.add(ring);
  }
  return group;
}

/** Thornstorm Totem — lightning + nature. A copper-wreathed living totem where thorns spark and arc between each other. */
export function buildLightningNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.4 });

  const baseR = 0.62 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), wood));
  base.scale.y = 0.36;
  base.position.y = 0.16;
  group.add(base);

  const trunkH = 1.0 + tier * 0.3;
  const trunk = shadowed(new THREE.Mesh(plinth(0.16, 0.23, trunkH, 7), wood));
  trunk.position.y = 0.32 + trunkH / 2;
  group.add(trunk);

  const coil = shadowed(new THREE.Mesh(spiralTube(0.24, trunkH * 0.95, 2 + tier * 0.5, 0.032), metal));
  coil.position.y = 0.34;
  group.add(coil);

  const crownY = 0.36 + trunkH;
  const thornCount = 4 + tier * 2;
  for (let i = 0; i < thornCount; i++) {
    const a = (i / thornCount) * Math.PI * 2;
    const thorn = shadowed(new THREE.Mesh(plinth(0.004, 0.03, 0.26, 5), metal));
    thorn.position.set(Math.cos(a) * 0.26, crownY, Math.sin(a) * 0.26);
    thorn.rotation.z = Math.cos(a) * 1.2;
    thorn.rotation.x = -Math.sin(a) * 1.2;
    group.add(thorn);

    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.036, 0), boltCore);
    tip.position.set(Math.cos(a) * 0.4, crownY + 0.1, Math.sin(a) * 0.4);
    applyMotion(tip, { bobAmp: 0.02, bobSpeed: 6 + i, bobPhase: i * 2 });
    group.add(tip);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + tier * 0.025, 1), boltCore);
  orb.position.y = crownY + 0.2;
  applyMotion(orb, { spinSpeed: 1.2 });
  group.add(orb);
  return group;
}

/** Seismic Coil — lightning + earth. A rock pillar wrapped in a charged coil, its fault-line cracks arcing with current. */
export function buildLightningEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.0 });

  const baseR = 0.7 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), stone));
  base.scale.y = 0.4;
  base.position.y = 0.18;
  group.add(base);

  const crack = new THREE.Mesh(roughRock(baseR * 1.02, 1, 0.3, tier), boltCore);
  crack.scale.copy(base.scale);
  crack.position.copy(base.position);
  group.add(crack);

  // Grounded rubble at the base, present from tier 1, before the orbiting
  // charged chunk shows up higher on the pillar.
  const rubbleCount = 2;
  for (let i = 0; i < rubbleCount; i++) {
    const a = (i / rubbleCount) * Math.PI * 2 + 0.7;
    const rubble = shadowed(new THREE.Mesh(roughRock(0.12, 0, 0.4, i + 6), stone));
    rubble.position.set(Math.cos(a) * baseR * 1.05, 0.14, Math.sin(a) * baseR * 1.05);
    group.add(rubble);
  }

  const pillarH = 0.95 + tier * 0.32;
  const pillar = shadowed(new THREE.Mesh(plinth(0.24, 0.32, pillarH, 8), stone));
  pillar.position.y = 0.34 + pillarH / 2;
  group.add(pillar);

  const coil = shadowed(new THREE.Mesh(spiralTube(0.28, pillarH * 0.9, 3 + tier, 0.028), metal));
  coil.position.y = 0.34;
  group.add(coil);

  const orbitCount = tier;
  for (let i = 0; i < orbitCount; i++) {
    const chunk = shadowed(new THREE.Mesh(roughRock(0.1, 0, 0.4, i + 4), stone));
    const holder = new THREE.Group();
    holder.position.set(0, 0.38 + pillarH * 0.6, 0);
    chunk.position.set(0.46, 0, 0);
    holder.add(chunk);
    const arc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.034, 0), boltCore);
    arc.position.set(0.46, 0.06, 0);
    holder.add(arc);
    applyMotion(holder, { spinSpeed: 0.5 + i * 0.15 });
    group.add(holder);
  }
  return group;
}

/** Arcflux Spire — lightning + arcane. A sleek conduit spire, entirely charged, coil rings replacing the usual rune plates. */
export function buildLightningArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const metal = createStructureMaterial("lightning", "metal", tier);
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.4 });

  const discR = 0.56 + tier * 0.03;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.87, 0.16, 10), metal));
  disc.position.y = 0.32;
  applyMotion(disc, { bobAmp: 0.02, bobSpeed: 1.4 });
  group.add(disc);

  const spireH = 1.15 + tier * 0.38;
  const spire = shadowed(new THREE.Mesh(obeliskGeo(0.05, 0.18, spireH), crystalMat));
  spire.position.y = 0.32 + spireH / 2;
  group.add(spire);

  const glow = new THREE.Mesh(obeliskGeo(0.02, 0.11, spireH * 0.94), boltCore);
  glow.position.copy(spire.position);
  applyMotion(glow, { spinSpeed: 1.0 });
  group.add(glow);

  // The inner glow core is fully hidden inside the opaque spire, so give
  // lightning an external presence too: sparking motes riding each coil ring.
  const ringCount = tier + 1;
  for (let i = 0; i < ringCount; i++) {
    const ringY = 0.44 + (i / ringCount) * spireH;
    const ring = shadowed(new THREE.Mesh(spiralTube(0.36 + i * 0.05, 0.02, 1, 0.022, 32), metal));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ringY;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.15) });
    group.add(ring);

    const sparkCount = 3;
    for (let s = 0; s < sparkCount; s++) {
      const a = (s / sparkCount) * Math.PI * 2 + i;
      const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), boltCore);
      const holder = new THREE.Group();
      holder.position.y = ringY;
      spark.position.set(Math.cos(a) * (0.36 + i * 0.05), 0, Math.sin(a) * (0.36 + i * 0.05));
      holder.add(spark);
      applyMotion(holder, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.15) });
      group.add(holder);
    }
  }
  return group;
}

/** Overgrowth Colossus — nature + earth. A boulder body overtaken by vines and moss, cracks glowing living green. */
export function buildNatureEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  // High uScale breaks the glow into speckled moss patches instead of a
  // solid coat, so the rock underneath (the "earth" half of this fusion)
  // stays legible instead of getting fully swallowed by green glow.
  const mossCore = createElementCoreMaterial("nature", tier, { scale: 7.5, intensity: 0.85 });
  const vineCore = createElementCoreMaterial("nature", tier, { scale: 2.2 });

  const baseR = 0.72 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), stone));
  base.scale.y = 0.42;
  base.position.y = 0.19;
  group.add(base);

  const boulderCount = tier + 1;
  let y = 0.34;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.48 - i * 0.08;
    const boulder = shadowed(new THREE.Mesh(roughRock(r, 1, 0.3, i * 2.5), stone));
    boulder.position.y = y + r * 0.7;
    group.add(boulder);

    const moss = new THREE.Mesh(roughRock(r * 1.02, 1, 0.3, i * 2.5), mossCore);
    moss.position.copy(boulder.position);
    group.add(moss);
    y += r * 1.2;
  }

  const vine = new THREE.Mesh(spiralTube(0.48, y * 0.85, 2.5 + tier * 0.4, 0.05), vineCore);
  vine.position.y = 0.22;
  group.add(vine);

  const leafCount = 3 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.12, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.5, 1);
    leaf.position.set(Math.cos(a) * 0.46, 0.32 + (i % 3) * (y / 3), Math.sin(a) * 0.46);
    group.add(leaf);
  }
  return group;
}

/** Druidic Sanctum — nature + arcane. A living tree canopy encircled by slow-turning arcane rune rings. */
export function buildNatureArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.5 });
  const natureCore = createElementCoreMaterial("nature", tier, { scale: 2.2 });

  const baseR = 0.62 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), wood));
  base.scale.y = 0.36;
  base.position.y = 0.16;
  group.add(base);

  const trunkH = 1.05 + tier * 0.32;
  const trunk = shadowed(new THREE.Mesh(plinth(0.17, 0.25, trunkH, 7), wood));
  trunk.position.y = 0.32 + trunkH / 2;
  group.add(trunk);

  const vine = new THREE.Mesh(spiralTube(0.24, trunkH * 0.95, 2 + tier * 0.4, 0.06), natureCore);
  vine.position.y = 0.34;
  applyMotion(vine, { spinSpeed: 0.15 });
  group.add(vine);

  const canopyY = 0.36 + trunkH;
  const leafCount = 4 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.15, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.5, 1);
    const r = 0.24 + (i % 2) * 0.1;
    leaf.position.set(Math.cos(a) * r, canopyY + (i % 2) * 0.09, Math.sin(a) * r);
    group.add(leaf);
  }

  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.56 + i * 0.19, 6 + i * 2, 0.13, arcaneCore);
    ring.position.y = canopyY + 0.06;
    ring.rotation.x = (i % 2) * 0.25;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.3 + i * 0.1) });
    group.add(ring);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + tier * 0.025, 1), arcaneCore);
  orb.position.y = canopyY + 0.24;
  applyMotion(orb, { spinSpeed: 0.7, bobAmp: 0.05, bobSpeed: 1.6 });
  group.add(orb);
  return group;
}

/** Runeforge Monolith — earth + arcane. A floating stone slab carved with glowing forge-glyphs and studded rivets. */
export function buildEarthArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier); // rivet accents, tinted neutral metal
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.7 });

  const discR = 0.6 + tier * 0.03;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.88, 0.18, 8), stone));
  disc.position.y = 0.34;
  applyMotion(disc, { bobAmp: 0.02, bobSpeed: 0.9 });
  group.add(disc);

  const slabH = 1.2 + tier * 0.4;
  const slab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.52, slabH, 0.2), stone));
  slab.position.y = 0.34 + slabH / 2;
  group.add(slab);

  const glyphCount = 2 + tier;
  for (let i = 0; i < glyphCount; i++) {
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), arcaneCore);
    glyph.position.set(0, 0.52 + (i / glyphCount) * slabH, 0.11);
    group.add(glyph);
    const glyphBack = glyph.clone();
    glyphBack.position.z = -0.11;
    glyphBack.rotation.y = Math.PI;
    group.add(glyphBack);
  }

  const rivetCount = 4 + tier * 2;
  for (let i = 0; i < rivetCount; i++) {
    const rivet = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), metal));
    const side = i % 2 === 0 ? 1 : -1;
    rivet.position.set(0.25 * side, 0.42 + (i / rivetCount) * slabH, 0.1);
    group.add(rivet);
  }

  const topOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + tier * 0.025, 1), arcaneCore);
  topOrb.position.y = 0.46 + slabH;
  applyMotion(topOrb, { spinSpeed: 0.5, bobAmp: 0.05, bobSpeed: 1.5 });
  group.add(topOrb);
  return group;
}
