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

/**
 * Grand Fusion tower models — the visual "merge tier 2" step up from the
 * 2-element fusion models in fusionModels.ts. Each build here deliberately:
 *   - reuses the parent fusion's silhouette/motif so it reads as an
 *     evolution, not an unrelated tower
 *   - adds more layers/mass than the parent (extra rings, extra boulders,
 *     taller cores, denser orbiting clusters) so tier-for-tier it looks
 *     heavier and more powerful
 *   - gives the third element its OWN clearly legible geometry/material,
 *     not just a recolored accent on the parent's two elements, so the
 *     tri-elemental identity reads at a glance
 *
 * New file (not fusionModels.ts, which is being edited concurrently by
 * another pass) — only imports from primitives.ts/motion.ts/coreMaterial.ts/
 * structureMaterial.ts, never modifies them.
 */

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Tempest Core — fire + ice + lightning (Steamcaller + lightning).
 * A double ice-crystal shell venting a taller fire core, now wrapped in a
 * storm coil with orbiting charged motes threading between the steam puffs.
 */
export function buildFireIceLightningTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.4 });
  const iceCoreMat = createElementCoreMaterial("ice", tier, { scale: 1.6, intensity: 1.2 });
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.6, intensity: 1.6 });

  const baseR = 0.78 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.1, 0.46, 8), iceCrystal));
  base.position.y = 0.23;
  group.add(base);

  const rim = shadowed(new THREE.Mesh(ringBand(baseR * 1.14, 0.06, 8, 24), metal));
  rim.position.y = 0.07;
  group.add(rim);

  // Storm coil wraps the outer crystal shell — the tesla-mast motif from
  // Plasma Arc/Frostshock Pylon, now integrated as a supporting cage rather
  // than a separate part.
  const coil = shadowed(new THREE.Mesh(spiralTube(baseR * 1.05, 0.9, 3.5 + tier, 0.03), metal));
  coil.position.y = 0.24;
  group.add(coil);

  // Lightning needs a clearly external, unmistakable presence of its own —
  // hidden-inside-the-shell geometry reads as "ice tower with a purple
  // wire", not a third element. A ring of jutting metal conductors tipped
  // with arcing bolt-cores, projecting past the crystal shell's silhouette,
  // fixes that (same spike+arc-tip language as Frostshock Pylon).
  const conductorCount = 4 + tier;
  for (let i = 0; i < conductorCount; i++) {
    const a = (i / conductorCount) * Math.PI * 2;
    const rod = shadowed(new THREE.Mesh(plinth(0.012, 0.04, 0.5 + tier * 0.06, 5), metal));
    rod.position.set(Math.cos(a) * baseR * 0.9, 0.62, Math.sin(a) * baseR * 0.9);
    rod.rotation.z = Math.cos(a) * 1.0;
    rod.rotation.x = -Math.sin(a) * 1.0;
    group.add(rod);

    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + (i % 2) * 0.02, 0), boltCore);
    tip.position.set(Math.cos(a) * baseR * 1.32, 0.72, Math.sin(a) * baseR * 1.32);
    applyMotion(tip, { bobAmp: 0.03, bobSpeed: 7 + i, bobPhase: i * 1.4, spinSpeed: 1.2 });
    group.add(tip);
  }

  const towerH = 1.15 + tier * 0.38;
  const shellH = towerH * 0.6;
  const outerShell = shadowed(new THREE.Mesh(crystalShard(0.44, shellH, 7), iceCrystal));
  outerShell.position.y = 0.46;
  group.add(outerShell);
  const innerShell = shadowed(new THREE.Mesh(crystalShard(0.3, shellH * 0.88, 7), iceCrystal));
  innerShell.position.y = 0.46;
  applyMotion(innerShell, { spinSpeed: -0.15 });
  group.add(innerShell);

  const ventCore = new THREE.Mesh(flameLick(0.25 + tier * 0.035, towerH * 0.85), fireCore);
  ventCore.position.y = 0.46 + shellH + towerH * 0.24;
  applyMotion(ventCore, { bobAmp: 0.06, bobSpeed: 3.2 });
  group.add(ventCore);

  const boltSpine = new THREE.Mesh(crystalShard(0.14, towerH * 0.7, 6), boltCore);
  boltSpine.position.y = 0.5;
  applyMotion(boltSpine, { spinSpeed: 0.5 });
  group.add(boltSpine);

  const puffCount = tier + 3;
  for (let i = 0; i < puffCount; i++) {
    const a = (i / puffCount) * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + (i % 2) * 0.035, 0), iceCoreMat);
    puff.position.set(Math.cos(a) * 0.44, 0.46 + shellH + i * 0.1, Math.sin(a) * 0.44);
    applyMotion(puff, { bobAmp: 0.09, bobSpeed: 1.1 + i * 0.2, bobPhase: i * 1.5, spinSpeed: 0.4 });
    group.add(puff);
  }

  // Charged motes orbiting between the puffs — the lightning motif made
  // spatially distinct from the fire and ice parts.
  const moteCount = tier + 2;
  for (let i = 0; i < moteCount; i++) {
    const a = (i / moteCount) * Math.PI * 2 + 0.6;
    const holder = new THREE.Group();
    holder.position.y = 0.6 + shellH * 0.5;
    const mote = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), boltCore);
    mote.position.set(Math.cos(a) * (baseR * 1.3), 0, Math.sin(a) * (baseR * 1.3));
    holder.add(mote);
    applyMotion(holder, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.7 + i * 0.15) });
    group.add(holder);
  }
  return group;
}

/**
 * Ashgrove Titan — fire + nature + earth (Magma Forge + nature).
 * A taller magma-boulder stack, every boulder now double-clad (molten fire
 * shell AND a living moss/vine layer) with a full fire-blossom canopy on top.
 */
export function buildFireNatureEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.1 });
  // High uScale keeps the moss as speckled patches rather than a solid coat
  // so the molten-stone read underneath stays legible (same technique used
  // in the parent Overgrowth Colossus / Magma Forge models).
  const mossCore = createElementCoreMaterial("nature", tier, { scale: 7.0, intensity: 0.9 });

  const baseR = 0.88 + tier * 0.06;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.34, tier), stone));
  base.scale.y = 0.46;
  base.position.y = 0.22;
  group.add(base);

  // Molten droplets AND root-tangles both present at the base from tier 1 —
  // the two organic/mineral halves visible together immediately.
  const groundCount = 4;
  for (let i = 0; i < groundCount; i++) {
    const a = (i / groundCount) * Math.PI * 2 + 0.4;
    const isEmber = i % 2 === 0;
    const item = new THREE.Mesh(roughRock(0.08, 0, 0.4, i + 4), isEmber ? fireCore : wood);
    item.position.set(Math.cos(a) * baseR * 1.05, 0.18, Math.sin(a) * baseR * 1.05);
    applyMotion(item, { bobAmp: 0.025, bobSpeed: 1.3 + i * 0.2, bobPhase: i });
    group.add(item);
  }

  const boulderCount = tier + 2;
  let y = 0.42;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.56 - i * 0.08;
    const geo = roughRock(r, 1, 0.32, i * 2.7);
    const boulder = shadowed(new THREE.Mesh(geo, stone));
    boulder.position.y = y + r * 0.7;
    group.add(boulder);

    const moltenShell = new THREE.Mesh(roughRock(r * 1.015, 1, 0.32, i * 2.7), fireCore);
    moltenShell.position.copy(boulder.position);
    group.add(moltenShell);

    const mossShell = new THREE.Mesh(roughRock(r * 1.03, 1, 0.32, i * 2.7), mossCore);
    mossShell.position.copy(boulder.position);
    group.add(mossShell);
    y += r * 1.22;
  }

  // Fire-blossom canopy — nature's flower motif built from flameLick
  // geometry lit by the fire core, so "living" and "burning" fuse instead
  // of sitting side by side.
  const blossomCount = 4 + tier * 2;
  for (let i = 0; i < blossomCount; i++) {
    const a = (i / blossomCount) * Math.PI * 2;
    const blossom = new THREE.Mesh(flameLick(0.13, 0.3 + tier * 0.06), fireCore);
    blossom.position.set(Math.cos(a) * 0.3, y + 0.05, Math.sin(a) * 0.3);
    applyMotion(blossom, { bobAmp: 0.04, bobSpeed: 2.4 + i * 0.25, bobPhase: i });
    group.add(blossom);

    const vine = new THREE.Mesh(spiralTube(0.1, 0.32, 1.4, 0.025), wood);
    vine.position.set(Math.cos(a) * 0.3, y - 0.14, Math.sin(a) * 0.3);
    group.add(vine);
  }

  const crownCore = new THREE.Mesh(flameLick(0.22 + tier * 0.03, 0.7 + tier * 0.2), fireCore);
  crownCore.position.y = y + 0.14;
  applyMotion(crownCore, { bobAmp: 0.05, bobSpeed: 2.1 });
  group.add(crownCore);
  return group;
}

/**
 * Elderfrost Sanctum — ice + nature + arcane (Permafrost Grove + arcane).
 * A larger frost-tree with a taller, icicle-heavy canopy plus a full arcane
 * glyph-ring halo growing from tier 1, unlike the parent which only gains
 * a seed motif.
 */
export function buildIceNatureArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.7 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.5, intensity: 1.35 });

  const baseR = 0.78 + tier * 0.06;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.32, tier), wood));
  base.scale.y = 0.4;
  base.position.y = 0.2;
  group.add(base);

  const collar = shadowed(new THREE.Mesh(ringBand(baseR * 1.05, 0.06, 8, 24), iceCrystal));
  collar.position.y = 0.07;
  group.add(collar);

  const trunkH = 1.2 + tier * 0.36;
  const trunk = shadowed(new THREE.Mesh(plinth(0.17, 0.28, trunkH, 8), wood));
  trunk.position.y = 0.38 + trunkH / 2;
  group.add(trunk);

  const iceSheath = shadowed(new THREE.Mesh(plinth(0.22, 0.31, trunkH * 0.55, 8), iceCrystal));
  iceSheath.position.y = 0.4 + trunkH * 0.28;
  group.add(iceSheath);

  const canopyY = 0.42 + trunkH;
  const leafCount = 4 + tier * 3;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.15, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.45, 1);
    const r = 0.27 + (i % 2) * 0.11;
    leaf.position.set(Math.cos(a) * r, canopyY + (i % 2) * 0.08, Math.sin(a) * r);
    group.add(leaf);

    const icicle = shadowed(new THREE.Mesh(crystalShard(0.06, 0.24 + (i % 2) * 0.12, 5), iceCrystal));
    icicle.position.set(Math.cos(a) * r, canopyY - 0.05, Math.sin(a) * r);
    icicle.rotation.x = Math.PI;
    group.add(icicle);
  }

  // Arcane ward rings present from tier 1, concentric at a single height
  // (Saturn-rings around the canopy, matching Druidic Sanctum's proven
  // read) rather than stacked at different heights — stacking made these
  // look like scattered falling confetti instead of a coherent halo.
  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.46 + i * 0.16, 6 + i * 2, 0.12, arcaneCore);
    ring.position.y = canopyY + 0.1;
    ring.rotation.x = (i % 2) * 0.22;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.12) });
    group.add(ring);
  }

  const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + tier * 0.03, 1), iceCore);
  seed.position.y = canopyY + 0.3;
  applyMotion(seed, { spinSpeed: 0.5, bobAmp: 0.05, bobSpeed: 1.5 });
  group.add(seed);
  return group;
}

/**
 * Stormforge Sovereign — lightning + earth + arcane (Runeforge Monolith +
 * lightning). A larger slab with more glyphs, plus a full coil cage of
 * spiraling storm-current wrapping the whole monolith (Seismic Coil's
 * motif, applied at monolith scale).
 */
export function buildLightningEarthArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.7 });
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.2 });

  const discR = 0.74 + tier * 0.04;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.88, 0.22, 10), stone));
  disc.position.y = 0.4;
  applyMotion(disc, { bobAmp: 0.02, bobSpeed: 0.9 });
  group.add(disc);

  const discCoil = shadowed(new THREE.Mesh(spiralTube(discR * 1.05, 0.3, 2.5, 0.03), metal));
  discCoil.position.y = 0.3;
  group.add(discCoil);

  const slabH = 1.5 + tier * 0.46;
  const slab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, slabH, 0.24), stone));
  slab.position.y = 0.4 + slabH / 2;
  group.add(slab);

  // Coil cage wrapping the full slab height — the lightning motif made
  // structural rather than a cosmetic accent. Radius kept well clear of the
  // glyph plane's footprint (and turn count kept modest) so the coil reads
  // as a cage around the slab, not a tangle drawn directly over the glyphs.
  const coilCage = shadowed(new THREE.Mesh(spiralTube(0.52, slabH, 2.5 + tier * 0.6, 0.026, 64), metal));
  coilCage.position.y = 0.4;
  group.add(coilCage);

  const glyphCount = 3 + tier;
  for (let i = 0; i < glyphCount; i++) {
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), arcaneCore);
    glyph.position.set(0, 0.6 + (i / glyphCount) * slabH, 0.13);
    group.add(glyph);
    const glyphBack = glyph.clone();
    glyphBack.position.z = -0.13;
    glyphBack.rotation.y = Math.PI;
    group.add(glyphBack);
  }

  const rivetCount = 6 + tier * 2;
  for (let i = 0; i < rivetCount; i++) {
    const rivet = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.034, 6, 6), metal));
    const side = i % 2 === 0 ? 1 : -1;
    rivet.position.set(0.29 * side, 0.5 + (i / rivetCount) * slabH, 0.11);
    group.add(rivet);

    // Sparking motes riding a subset of rivets — visible lightning presence
    // outside the coil cage too.
    if (i % 2 === 0) {
      const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), boltCore);
      spark.position.copy(rivet.position);
      spark.position.z += 0.08;
      applyMotion(spark, { bobAmp: 0.03, bobSpeed: 6 + i, bobPhase: i });
      group.add(spark);
    }
  }

  const topOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + tier * 0.03, 1), arcaneCore);
  topOrb.position.y = 0.54 + slabH;
  applyMotion(topOrb, { spinSpeed: 0.5, bobAmp: 0.05, bobSpeed: 1.5 });
  group.add(topOrb);

  const boltCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 + tier * 0.025, 1), boltCore);
  boltCrown.position.y = 0.54 + slabH;
  applyMotion(boltCrown, { spinSpeed: -1.1 });
  group.add(boltCrown);
  return group;
}

/**
 * Voidfire Nexus — fire + lightning + arcane (Plasma Arc + arcane).
 * A larger tesla cage cradling a bigger plasma orb, now contained by a
 * full three-ring arcane ward system as the flavor text describes.
 */
export function buildFireLightningArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const metal = createStructureMaterial("lightning", "metal", tier);
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.6 });
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.6, intensity: 1.6 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.6, intensity: 1.3 });

  const baseR = 0.68 + tier * 0.045;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.16, 0.4, 12), metal));
  base.position.y = 0.2;
  group.add(base);

  const wardBaseRing = shadowed(new THREE.Mesh(ringBand(baseR * 1.08, 0.05, 8, 28), crystalMat));
  wardBaseRing.position.y = 0.08;
  group.add(wardBaseRing);

  const mastH = 0.95 + tier * 0.3;
  const mast = shadowed(new THREE.Mesh(plinth(0.1, 0.15, mastH, 8), metal));
  mast.position.y = 0.4 + mastH / 2;
  group.add(mast);

  const cageY = 0.46 + mastH;
  const spikeCount = 5 + tier;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2;
    const spike = shadowed(new THREE.Mesh(plinth(0.007, 0.035, 0.4, 5), metal));
    spike.position.set(Math.cos(a) * 0.22, cageY, Math.sin(a) * 0.22);
    spike.rotation.z = Math.cos(a) * 1.1;
    spike.rotation.x = -Math.sin(a) * 1.1;
    group.add(spike);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27 + tier * 0.04, 1), fireCore);
  orb.position.y = cageY;
  applyMotion(orb, { bobAmp: 0.035, bobSpeed: 3 });
  group.add(orb);

  const arcRing = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + tier * 0.05, 1), boltCore);
  arcRing.position.y = cageY;
  applyMotion(arcRing, { spinSpeed: 1.7 });
  group.add(arcRing);

  // Three interlocking arcane ward rings — the tower's namesake containment
  // system, distinct in material (crystal) and motion axis from anything in
  // the parent Plasma Arc.
  const wardTilts = [0, Math.PI / 3, -Math.PI / 3];
  for (let i = 0; i < wardTilts.length; i++) {
    const ring = glyphRing(0.5 + tier * 0.04, 6 + tier, 0.14, arcaneCore);
    ring.position.y = cageY;
    ring.rotation.x = Math.PI / 2 + wardTilts[i];
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.4 + i * 0.15) });
    group.add(ring);

    const wardBand = shadowed(new THREE.Mesh(ringBand(0.5 + tier * 0.04, 0.018, 5, 28), crystalMat));
    wardBand.rotation.x = Math.PI / 2 + wardTilts[i];
    wardBand.position.y = cageY;
    group.add(wardBand);
  }

  for (let i = 0; i < tier + 1; i++) {
    const tip = new THREE.Mesh(flameLick(0.07, 0.24), fireCore);
    tip.position.set(0.26, cageY - 0.05 + i * 0.17, 0);
    tip.rotation.z = -Math.PI / 2.4;
    applyMotion(tip, { spinSpeed: 0.9, bobAmp: 0.02, bobSpeed: 4 + i, bobPhase: i * 2 });
    group.add(tip);
  }
  return group;
}

/**
 * Wildfrost Bastion — ice + nature + earth (Glacier Bastion + nature).
 * A taller stacked rampart (alternating rock/ice as in the parent) fully
 * threaded with vines and topped by a living canopy crown, so the rampart
 * silhouette itself carries all three elements at once.
 */
export function buildIceNatureEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.7 });
  const vineCore = createElementCoreMaterial("nature", tier, { scale: 2.2 });

  const baseR = 0.86 + tier * 0.06;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.28, tier), stone));
  base.scale.y = 0.42;
  base.position.y = 0.21;
  group.add(base);

  const chunkCount = tier + 3;
  let y = 0.38;
  for (let i = 0; i < chunkCount; i++) {
    const r = 0.5 - i * 0.05;
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
    y += r * 1.12;
  }

  // A single continuous vine spirals the full height of the rampart,
  // threading through every chunk instead of only decorating the top —
  // nature reads as structurally woven in, not applied after the fact.
  const vine = shadowed(new THREE.Mesh(spiralTube(baseR * 0.95, y * 0.92, 3 + tier * 0.5, 0.045), wood));
  vine.position.y = 0.24;
  group.add(vine);
  const vineGlow = new THREE.Mesh(spiralTube(baseR * 0.97, y * 0.92, 3 + tier * 0.5, 0.02), vineCore);
  vineGlow.position.y = 0.24;
  group.add(vineGlow);

  const leafCount = 4 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.14, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.5, 1);
    leaf.position.set(Math.cos(a) * (baseR * 0.62), 0.36 + (i % 3) * (y / 3), Math.sin(a) * (baseR * 0.62));
    group.add(leaf);
  }

  // Living crown at the very top — the rampart no longer just ends, it
  // culminates in a bloom of frost-hardy growth.
  const crownLeafCount = 3 + tier;
  for (let i = 0; i < crownLeafCount; i++) {
    const a = (i / crownLeafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.16, 0, 0.3, i + 8), wood));
    leaf.scale.set(1.5, 0.5, 1);
    leaf.position.set(Math.cos(a) * 0.26, y + 0.05, Math.sin(a) * 0.26);
    group.add(leaf);

    const icicle = shadowed(new THREE.Mesh(crystalShard(0.05, 0.22, 5), iceCrystal));
    icicle.position.set(Math.cos(a) * 0.26, y - 0.02, Math.sin(a) * 0.26);
    icicle.rotation.x = Math.PI;
    group.add(icicle);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Second curation pass — 6 more Grand Fusion models, same conventions as the
// six above (parent silhouette carried forward + extra mass + the third
// element given its own unmistakable geometry/material, never just a
// recolored accent).
// ---------------------------------------------------------------------------

/**
 * Verdant Geyser — fire + ice + nature (Steamcaller + nature).
 * The same ice-crystal vent and fire core as Steamcaller, now taller and
 * wrapped in a single continuous living vine that climbs the whole shell and
 * blooms into a full canopy of scald-blossoms above the steam column —
 * nature reads as grown INTO the geyser's structure, not bolted onto its top.
 */
export function buildFireIceNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.3 });
  const iceCoreMat = createElementCoreMaterial("ice", tier, { scale: 1.6, intensity: 1.15 });
  const bloomCore = createElementCoreMaterial("nature", tier, { scale: 2.6, intensity: 1.15 });

  const baseR = 0.78 + tier * 0.05;
  const base = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.1, 0.44, 7), iceCrystal));
  base.position.y = 0.22;
  group.add(base);

  const rim = shadowed(new THREE.Mesh(ringBand(baseR * 1.13, 0.06, 7, 22), iceCrystal));
  rim.position.y = 0.07;
  group.add(rim);

  const towerH = 1.1 + tier * 0.36;
  const shellH = towerH * 0.62;

  // A single continuous vine spirals the full crystal shell, present from
  // tier 1 — nature reads as structurally woven in (the same technique
  // Wildfrost Bastion uses), rather than only decorating the crown.
  const vine = shadowed(new THREE.Mesh(spiralTube(baseR * 1.02, shellH + 0.34, 2.8 + tier * 0.5, 0.045), wood));
  vine.position.y = 0.28;
  group.add(vine);

  const outerShell = shadowed(new THREE.Mesh(crystalShard(0.42, shellH, 7), iceCrystal));
  outerShell.position.y = 0.44;
  group.add(outerShell);
  const innerShell = shadowed(new THREE.Mesh(crystalShard(0.28, shellH * 0.86, 7), iceCrystal));
  innerShell.position.y = 0.44;
  applyMotion(innerShell, { spinSpeed: -0.12 });
  group.add(innerShell);

  const ventCore = new THREE.Mesh(flameLick(0.24 + tier * 0.035, towerH * 0.82), fireCore);
  ventCore.position.y = 0.44 + shellH + towerH * 0.24;
  applyMotion(ventCore, { bobAmp: 0.06, bobSpeed: 3.2 });
  group.add(ventCore);

  const puffCount = tier + 3;
  for (let i = 0; i < puffCount; i++) {
    const a = (i / puffCount) * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + (i % 2) * 0.035, 0), iceCoreMat);
    puff.position.set(Math.cos(a) * 0.42, 0.44 + shellH + i * 0.09, Math.sin(a) * 0.42);
    applyMotion(puff, { bobAmp: 0.08, bobSpeed: 1.1 + i * 0.2, bobPhase: i * 1.5, spinSpeed: 0.35 });
    group.add(puff);
  }

  // Blossom canopy grown from the vine's tip — nature's own clearly
  // legible silhouette crowning the geyser, distinct in both shape and
  // material from the ice puffs and the fire vent.
  const canopyY = 0.44 + shellH + 0.16;
  const blossomCount = 4 + tier * 2;
  for (let i = 0; i < blossomCount; i++) {
    const a = (i / blossomCount) * Math.PI * 2;
    const r = 0.3 + (i % 2) * 0.08;
    const stem = shadowed(new THREE.Mesh(spiralTube(0.05, 0.22, 1.2, 0.02), wood));
    stem.position.set(Math.cos(a) * r, canopyY - 0.1, Math.sin(a) * r);
    group.add(stem);

    const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + (i % 2) * 0.02, 0), bloomCore);
    bud.position.set(Math.cos(a) * r, canopyY + 0.08, Math.sin(a) * r);
    applyMotion(bud, { bobAmp: 0.03, bobSpeed: 2.2 + i * 0.2, bobPhase: i });
    group.add(bud);
  }

  const crownBloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + tier * 0.03, 1), bloomCore);
  crownBloom.position.y = canopyY + 0.28 + tier * 0.05;
  applyMotion(crownBloom, { spinSpeed: 0.4, bobAmp: 0.05, bobSpeed: 1.6 });
  group.add(crownBloom);

  return group;
}

/**
 * Stormglass Oracle — ice + lightning + arcane (Frostshock Pylon + arcane).
 * The same lightning-veined ice-shard cluster as Frostshock Pylon, now
 * ringed by a full set of orbiting arcane ward-glyphs and crowned by a
 * faceted scrying lens — arcane gets its own crystal-purple structure and
 * glow, not just a tint on the existing ice/lightning parts.
 */
export function buildIceLightningArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.2 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.6, intensity: 1.3 });

  const baseR = 0.7 + tier * 0.045;
  const coilBase = shadowed(new THREE.Mesh(plinth(baseR, baseR * 1.16, 0.36, 9), metal));
  coilBase.position.y = 0.18;
  group.add(coilBase);
  const coil = shadowed(new THREE.Mesh(spiralTube(baseR * 0.92, 0.3, 3.2 + tier, 0.028), metal));
  coil.position.y = 0.2;
  group.add(coil);

  // Arcane ward-band rim sits right above the coil base — the oracle's
  // containment ring, present from tier 1.
  const wardRim = shadowed(new THREE.Mesh(ringBand(baseR * 1.1, 0.045, 8, 26), crystalMat));
  wardRim.position.y = 0.06;
  group.add(wardRim);

  const centerH = 1.25 + tier * 0.42;
  const shard = shadowed(new THREE.Mesh(crystalShard(0.34, centerH, 6), iceCrystal));
  shard.position.y = 0.38;
  group.add(shard);

  const boltShard = new THREE.Mesh(crystalShard(0.2, centerH * 0.86, 6), boltCore);
  boltShard.position.y = 0.38;
  applyMotion(boltShard, { spinSpeed: -0.3 });
  group.add(boltShard);

  const spikeCount = tier + 4;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2;
    const h = 0.4 + (i % 2) * 0.18;
    const spike = shadowed(new THREE.Mesh(crystalShard(0.09, h, 5), iceCrystal));
    spike.position.set(Math.cos(a) * 0.56, 0.36, Math.sin(a) * 0.56);
    spike.rotation.z = Math.cos(a) * 0.4;
    spike.rotation.x = -Math.sin(a) * 0.4;
    group.add(spike);

    const arc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), boltCore);
    arc.position.set(Math.cos(a) * 0.62, 0.36 + h * 0.6, Math.sin(a) * 0.62);
    applyMotion(arc, { bobAmp: 0.02, bobSpeed: 8 + i, bobPhase: i * 3 });
    group.add(arc);
  }

  // Arcane ward-glyph rings — the oracle's own halo, concentric at the
  // shard's upper reach so it reads as a lens gazing outward rather than a
  // scattered accent (same Saturn-rings technique as Elderfrost Sanctum).
  const ringCount = tier + 1;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.5 + i * 0.15, 6 + i * 2, 0.13, arcaneCore);
    ring.position.y = 0.38 + centerH * 0.72;
    ring.rotation.x = (i % 2) * 0.24;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.4 + i * 0.14) });
    group.add(ring);
  }

  // Faceted scrying-lens crystal capping the whole structure.
  const lens = shadowed(new THREE.Mesh(crystalShard(0.2 + tier * 0.03, 0.32 + tier * 0.06, 8), crystalMat));
  lens.position.y = 0.38 + centerH + 0.08;
  applyMotion(lens, { spinSpeed: 0.5 });
  group.add(lens);
  const lensCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + tier * 0.025, 1), arcaneCore);
  lensCore.position.y = 0.38 + centerH + 0.24;
  applyMotion(lensCore, { spinSpeed: -0.8, bobAmp: 0.04, bobSpeed: 1.7 });
  group.add(lensCore);

  return group;
}

/**
 * Fulgurite Forge — fire + lightning + earth (Seismic Coil + fire).
 * The same coil-wrapped rock pillar as Seismic Coil, now running molten
 * along a full outer shell and topped by a proper flame vent — fire is a
 * distinct glowing skin over the whole pillar, not a small accent.
 */
export function buildFireLightningEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.1 });
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.2 });

  const baseR = 0.86 + tier * 0.055;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.32, tier), stone));
  base.scale.y = 0.42;
  base.position.y = 0.21;
  group.add(base);

  const crack = new THREE.Mesh(roughRock(baseR * 1.02, 1, 0.32, tier), boltCore);
  crack.scale.copy(base.scale);
  crack.position.copy(base.position);
  group.add(crack);

  // Molten pools ringing the base, present from tier 1 — fire's own
  // ground-level presence, mirroring how the parent's rubble sits at the base.
  const poolCount = 4;
  for (let i = 0; i < poolCount; i++) {
    const a = (i / poolCount) * Math.PI * 2 + 0.4;
    const pool = new THREE.Mesh(roughRock(0.09, 0, 0.4, i + 4), fireCore);
    pool.position.set(Math.cos(a) * baseR * 1.08, 0.16, Math.sin(a) * baseR * 1.08);
    applyMotion(pool, { bobAmp: 0.025, bobSpeed: 1.4 + i * 0.2, bobPhase: i });
    group.add(pool);
  }

  const pillarH = 1.2 + tier * 0.4;
  const pillar = shadowed(new THREE.Mesh(plinth(0.28, 0.38, pillarH, 9), stone));
  pillar.position.y = 0.4 + pillarH / 2;
  group.add(pillar);

  // Molten shell wraps the full pillar height, a hair proud of the stone
  // surface — fire gets a continuous, unmistakable skin rather than a patch.
  const moltenShell = new THREE.Mesh(plinth(0.285, 0.386, pillarH, 9), fireCore);
  moltenShell.position.copy(pillar.position);
  group.add(moltenShell);

  const coil = shadowed(new THREE.Mesh(spiralTube(0.36, pillarH * 0.92, 3.4 + tier, 0.03), metal));
  coil.position.y = 0.4;
  group.add(coil);

  const orbitCount = tier + 1;
  for (let i = 0; i < orbitCount; i++) {
    const holder = new THREE.Group();
    holder.position.set(0, 0.44 + pillarH * (0.4 + i * 0.22), 0);
    const chunk = shadowed(new THREE.Mesh(roughRock(0.11, 0, 0.4, i + 4), stone));
    chunk.position.set(0.52, 0, 0);
    holder.add(chunk);
    const moltenChunk = new THREE.Mesh(roughRock(0.113, 0, 0.4, i + 4), fireCore);
    moltenChunk.position.set(0.52, 0, 0);
    holder.add(moltenChunk);
    const arc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), boltCore);
    arc.position.set(0.52, 0.08, 0);
    holder.add(arc);
    applyMotion(holder, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.5 + i * 0.15) });
    group.add(holder);
  }

  const ventTop = new THREE.Mesh(flameLick(0.2 + tier * 0.03, 0.56 + tier * 0.18), fireCore);
  ventTop.position.y = 0.42 + pillarH + 0.1;
  applyMotion(ventTop, { bobAmp: 0.05, bobSpeed: 2.4 });
  group.add(ventTop);

  const boltCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + tier * 0.025, 1), boltCore);
  boltCrown.position.y = 0.42 + pillarH + 0.06;
  applyMotion(boltCrown, { spinSpeed: -1.0 });
  group.add(boltCrown);

  return group;
}

/**
 * Wardroot Sentinel — nature + earth + arcane (Overgrowth Colossus + arcane).
 * The same moss-veined boulder stack as Overgrowth Colossus, grown taller
 * and now haloed by a full set of orbiting ward-glyph rings plus a
 * rune-etched crown boulder — arcane reads as a distinct crystalline glyph
 * system layered on top, separate from the mossy speckle that already
 * carries nature.
 */
export function buildNatureEarthArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  const mossCore = createElementCoreMaterial("nature", tier, { scale: 7.2, intensity: 0.85 });
  const vineCore = createElementCoreMaterial("nature", tier, { scale: 2.2 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.6, intensity: 1.25 });

  const baseR = 0.86 + tier * 0.055;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), stone));
  base.scale.y = 0.44;
  base.position.y = 0.22;
  group.add(base);

  const boulderCount = tier + 2;
  let y = 0.38;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.52 - i * 0.075;
    const boulder = shadowed(new THREE.Mesh(roughRock(r, 1, 0.3, i * 2.5), stone));
    boulder.position.y = y + r * 0.7;
    group.add(boulder);

    const moss = new THREE.Mesh(roughRock(r * 1.02, 1, 0.3, i * 2.5), mossCore);
    moss.position.copy(boulder.position);
    group.add(moss);
    y += r * 1.2;
  }

  // Vine radius hugs the boulder stack itself (matched to boulder radii,
  // not the wider base) so it reads as wrapped growth rather than a
  // free-floating ring — and gets a solid wood structural layer plus a
  // thin glow overlay instead of one large blazing tube, so it doesn't
  // wash out the stone underneath.
  const vineRadius = 0.5 + tier * 0.02;
  const vineWrap = shadowed(new THREE.Mesh(spiralTube(vineRadius, y * 0.82, 2.4 + tier * 0.4, 0.045), wood));
  vineWrap.position.y = 0.26;
  group.add(vineWrap);
  const vineGlow = new THREE.Mesh(spiralTube(vineRadius * 1.03, y * 0.82, 2.4 + tier * 0.4, 0.018), vineCore);
  vineGlow.position.y = 0.26;
  group.add(vineGlow);

  const leafCount = 3 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.12, 0, 0.3, i), wood));
    leaf.scale.set(1.4, 0.5, 1);
    leaf.position.set(Math.cos(a) * 0.5, 0.34 + (i % 3) * (y / 3), Math.sin(a) * 0.5);
    group.add(leaf);
  }

  // Rune-etched crown shell over the topmost boulder — arcane's own
  // crackling glyph pattern, distinct from the mossy speckle beneath it.
  const crownR = 0.52 - (boulderCount - 1) * 0.075;
  const crownGlyphShell = new THREE.Mesh(roughRock(crownR * 1.05, 1, 0.3, boulderCount * 2.5), arcaneCore);
  crownGlyphShell.position.y = y - crownR * 1.2 + crownR * 0.7;
  group.add(crownGlyphShell);

  // Orbiting ward-glyph halo above the whole colossus — present from tier 1,
  // the guardian's watching rings.
  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.58 + i * 0.18, 6 + i * 2, 0.14, arcaneCore);
    ring.position.y = y + 0.16;
    ring.rotation.x = (i % 2) * 0.24;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.32 + i * 0.1) });
    group.add(ring);
  }

  const wardOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + tier * 0.03, 1), arcaneCore);
  wardOrb.position.y = y + 0.34 + tier * 0.06;
  applyMotion(wardOrb, { spinSpeed: 0.55, bobAmp: 0.05, bobSpeed: 1.5 });
  group.add(wardOrb);

  return group;
}

/**
 * Stormroot Monument — lightning + nature + earth (Thornstorm Totem +
 * earth). The same coil-wrapped storm-thorn totem as Thornstorm Totem, now
 * rooted in a full ring of anchoring bedrock boulders with a stone collar
 * fused partway up the trunk — earth gets real structural mass at both the
 * base and mid-height, not just ground clutter.
 */
export function buildLightningNatureEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.3 });

  const baseR = 0.86 + tier * 0.055;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), stone));
  base.scale.y = 0.4;
  base.position.y = 0.2;
  group.add(base);

  // Anchoring boulders ring the base, present from tier 1 — earth's own
  // ground-level mass, distinct from the wood trunk rising through the center.
  const anchorCount = 4;
  for (let i = 0; i < anchorCount; i++) {
    const a = (i / anchorCount) * Math.PI * 2 + 0.3;
    const anchor = shadowed(new THREE.Mesh(roughRock(0.16, 0, 0.36, i + 3), stone));
    anchor.position.set(Math.cos(a) * baseR * 1.05, 0.18, Math.sin(a) * baseR * 1.05);
    group.add(anchor);

    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), boltCore);
    spark.position.set(Math.cos(a) * baseR * 1.05, 0.32, Math.sin(a) * baseR * 1.05);
    applyMotion(spark, { bobAmp: 0.02, bobSpeed: 7 + i, bobPhase: i * 2 });
    group.add(spark);
  }

  const trunkH = 1.15 + tier * 0.34;
  const trunk = shadowed(new THREE.Mesh(plinth(0.18, 0.26, trunkH, 8), wood));
  trunk.position.y = 0.36 + trunkH / 2;
  group.add(trunk);

  // Stone collar fused partway up the trunk — the totem's roots have
  // grown deep enough to pull bedrock up with them.
  const collarH = trunkH * 0.3;
  const collar = shadowed(new THREE.Mesh(plinth(0.26, 0.3, collarH, 8), stone));
  collar.position.y = 0.4 + trunkH * 0.24;
  group.add(collar);

  const coil = shadowed(new THREE.Mesh(spiralTube(0.28, trunkH * 0.95, 2.4 + tier * 0.5, 0.034), metal));
  coil.position.y = 0.38;
  group.add(coil);

  const crownY = 0.4 + trunkH;
  const thornCount = 5 + tier * 2;
  for (let i = 0; i < thornCount; i++) {
    const a = (i / thornCount) * Math.PI * 2;
    const thorn = shadowed(new THREE.Mesh(plinth(0.004, 0.032, 0.3, 5), metal));
    thorn.position.set(Math.cos(a) * 0.3, crownY, Math.sin(a) * 0.3);
    thorn.rotation.z = Math.cos(a) * 1.2;
    thorn.rotation.x = -Math.sin(a) * 1.2;
    group.add(thorn);

    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), boltCore);
    tip.position.set(Math.cos(a) * 0.46, crownY + 0.1, Math.sin(a) * 0.46);
    applyMotion(tip, { bobAmp: 0.02, bobSpeed: 6 + i, bobPhase: i * 2 });
    group.add(tip);
  }

  // Boulder cairn crowning the totem — earth reaching all the way to the
  // top, not just anchoring the base.
  const crownBoulder = shadowed(new THREE.Mesh(roughRock(0.2 + tier * 0.02, 1, 0.32, 12), stone));
  crownBoulder.position.y = crownY + 0.22;
  group.add(crownBoulder);

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + tier * 0.028, 1), boltCore);
  orb.position.y = crownY + 0.4;
  applyMotion(orb, { spinSpeed: 1.15 });
  group.add(orb);

  return group;
}

/**
 * Emberroot Sigil — fire + nature + arcane (Hellfire Sigil + nature).
 * The same obsidian obelisk and captive-flame core as Hellfire Sigil, now
 * climbed by a full living vine lattice that blooms into ember-lit buds
 * near the crown — nature gets its own wood structure AND its own green
 * core glow, distinct from the fire core hidden inside the obelisk.
 */
export function buildFireNatureArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.3 });
  const vineCore = createElementCoreMaterial("nature", tier, { scale: 2.4, intensity: 1.05 });

  const discR = 0.72 + tier * 0.04;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.88, 0.2, 9), crystalMat));
  disc.position.y = 0.4;
  applyMotion(disc, { bobAmp: 0.03, bobSpeed: 1 });
  group.add(disc);

  // Roots have cracked up through the disc's rim, present from tier 1 —
  // nature's ground-level presence, mirroring how embers sit at the base of
  // the parent Hellfire Sigil.
  const rootCount = 4;
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + 0.6;
    const root = shadowed(new THREE.Mesh(spiralTube(0.05, 0.22, 1.3, 0.025), wood));
    root.position.set(Math.cos(a) * discR * 0.82, 0.2, Math.sin(a) * discR * 0.82);
    group.add(root);

    const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), vineCore);
    bud.position.set(Math.cos(a) * discR * 0.82, 0.36, Math.sin(a) * discR * 0.82);
    applyMotion(bud, { bobAmp: 0.03, bobSpeed: 1.6 + i * 0.2, bobPhase: i });
    group.add(bud);
  }

  const obeliskH = 1.35 + tier * 0.44;
  const pillar = shadowed(new THREE.Mesh(obeliskGeo(0.08, 0.27, obeliskH), crystalMat));
  pillar.position.y = 0.4 + obeliskH / 2;
  group.add(pillar);

  const flameCoreMesh = new THREE.Mesh(obeliskGeo(0.032, 0.14, obeliskH * 0.94), fireCore);
  flameCoreMesh.position.copy(pillar.position);
  applyMotion(flameCoreMesh, { spinSpeed: 0.4 });
  group.add(flameCoreMesh);

  // Vine lattice climbs the full obelisk face — nature's own clearly
  // legible geometry, structurally wrapping the stone rather than sitting
  // only at the base or crown.
  const vineWrap = shadowed(new THREE.Mesh(spiralTube(0.3, obeliskH * 0.94, 2.6 + tier * 0.5, 0.04), wood));
  vineWrap.position.y = 0.4;
  group.add(vineWrap);
  const vineGlow = new THREE.Mesh(spiralTube(0.31, obeliskH * 0.94, 2.6 + tier * 0.5, 0.018), vineCore);
  vineGlow.position.y = 0.4;
  group.add(vineGlow);

  const ringCount = tier;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.46 + i * 0.17, 5 + i * 2, 0.17, fireCore);
    ring.position.y = 0.56 + i * 0.34;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.1), bobAmp: 0.03, bobSpeed: 1.2 });
    group.add(ring);
  }

  // Living crown of ember-lit blossoms grown from the vine's topmost reach.
  const blossomCount = 3 + tier * 2;
  for (let i = 0; i < blossomCount; i++) {
    const a = (i / blossomCount) * Math.PI * 2;
    const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + (i % 2) * 0.02, 0), vineCore);
    blossom.position.set(Math.cos(a) * 0.22, 0.44 + obeliskH - 0.1, Math.sin(a) * 0.22);
    applyMotion(blossom, { bobAmp: 0.03, bobSpeed: 2.4 + i * 0.25, bobPhase: i });
    group.add(blossom);
  }

  const tip = new THREE.Mesh(flameLick(0.16 + tier * 0.026, 0.5), fireCore);
  tip.position.y = 0.44 + obeliskH;
  applyMotion(tip, { bobAmp: 0.05, bobSpeed: 2.2 });
  group.add(tip);

  return group;
}
