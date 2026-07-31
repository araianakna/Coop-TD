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

// ---------------------------------------------------------------------------
// Third curation pass — the final 8 Grand Fusion models, completing all
// C(6,3) = 20 triads. Same conventions as the 12 above (parent silhouette
// carried forward + extra mass + the third element given its own
// unmistakable geometry/material, never just a recolored accent).
// ---------------------------------------------------------------------------

/**
 * Cinderglass Crucible — fire + ice + earth (Glacier Bastion + fire).
 * The same alternating rock/ice rampart as Glacier Bastion, taller and now
 * fused with a glowing molten crack running through every stone chunk, the
 * whole structure culminating in an open crucible bowl of churning
 * cinderglass — fire gets a real vessel of its own, not just a crack tint.
 */
export function buildFireIceEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const emberCore = createElementCoreMaterial("fire", tier, { scale: 2.2 });
  const crucibleCore = createElementCoreMaterial("fire", tier, { scale: 3.6, intensity: 1.4 });

  const baseR = 0.86 + tier * 0.06;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.28, tier), stone));
  base.scale.y = 0.42;
  base.position.y = 0.21;
  group.add(base);

  // Molten droplets pooled at the base rim, present from tier 1 — fire's own
  // ground-level presence, mirroring the technique used by Magma Forge/
  // Ashgrove Titan.
  const poolCount = 4;
  for (let i = 0; i < poolCount; i++) {
    const a = (i / poolCount) * Math.PI * 2 + 0.4;
    const pool = new THREE.Mesh(roughRock(0.08, 0, 0.4, i + 4), emberCore);
    pool.position.set(Math.cos(a) * baseR * 1.06, 0.16, Math.sin(a) * baseR * 1.06);
    applyMotion(pool, { bobAmp: 0.025, bobSpeed: 1.3 + i * 0.2, bobPhase: i });
    group.add(pool);
  }

  const chunkCount = tier + 3;
  let y = 0.36;
  for (let i = 0; i < chunkCount; i++) {
    const r = 0.5 - i * 0.05;
    const isIce = i % 2 === 1;
    const mat = isIce ? iceCrystal : stone;
    const geo = isIce ? crystalShard(r, r * 1.6, 6) : roughRock(r, 1, 0.28, i * 2);
    const chunk = shadowed(new THREE.Mesh(geo, mat));
    chunk.position.y = y + r * 0.6;
    group.add(chunk);

    // Molten fire-crack shell over every rock chunk (never the ice ones) —
    // fire reads as threaded structurally through the rampart's stone half.
    if (!isIce) {
      const crack = new THREE.Mesh(roughRock(r * 1.02, 1, 0.28, i * 2), emberCore);
      crack.position.copy(chunk.position);
      group.add(crack);
    }
    y += r * 1.1;
  }

  // Open crucible bowl capping the rampart — a real vessel for the molten
  // fire, not just a glowing crack, so fire has its own clearly legible form.
  const crucibleY = y + 0.1;
  const bowlR = 0.36 + tier * 0.03;
  const bowl = shadowed(new THREE.Mesh(plinth(bowlR, bowlR * 1.18, 0.22, 8), stone));
  bowl.position.y = crucibleY;
  group.add(bowl);

  const bowlRim = shadowed(new THREE.Mesh(ringBand(bowlR * 1.05, 0.04, 8, 20), iceCrystal));
  bowlRim.position.y = crucibleY + 0.1;
  group.add(bowlRim);

  const pool = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + tier * 0.035, 1), crucibleCore);
  pool.position.y = crucibleY + 0.15;
  applyMotion(pool, { bobAmp: 0.05, bobSpeed: 2.4 });
  group.add(pool);

  // Ice shards alternate with flame licks around the crucible's crown — the
  // two elements share the same ring instead of stacking, so the tri-elemental
  // read is immediate at the top of the silhouette.
  const crownCount = 4 + tier * 2;
  for (let i = 0; i < crownCount; i++) {
    const a = (i / crownCount) * Math.PI * 2;
    if (i % 2 === 0) {
      const shard = shadowed(new THREE.Mesh(crystalShard(0.07, 0.3 + tier * 0.05, 5), iceCrystal));
      shard.position.set(Math.cos(a) * bowlR * 1.15, crucibleY + 0.05, Math.sin(a) * bowlR * 1.15);
      shard.rotation.z = Math.cos(a) * 0.5;
      shard.rotation.x = -Math.sin(a) * 0.5;
      group.add(shard);
    } else {
      const flame = new THREE.Mesh(flameLick(0.09, 0.28 + tier * 0.05), emberCore);
      flame.position.set(Math.cos(a) * bowlR * 1.15, crucibleY + 0.05, Math.sin(a) * bowlR * 1.15);
      applyMotion(flame, { bobAmp: 0.04, bobSpeed: 2.8 + i * 0.2, bobPhase: i });
      group.add(flame);
    }
  }

  const apex = new THREE.Mesh(crystalShard(0.16 + tier * 0.025, 0.46 + tier * 0.14, 7), crucibleCore);
  apex.position.y = crucibleY + 0.3;
  applyMotion(apex, { spinSpeed: 0.4, bobAmp: 0.04, bobSpeed: 1.8 });
  group.add(apex);

  return group;
}

/**
 * Scaldweave Reliquary — fire + ice + arcane (Frostweave Loom + fire).
 * The same floating ice-crystal obelisk as Frostweave Loom, now split
 * top-to-bottom between an icy glow and a burning one, wrapped in a woven
 * fire-lit thread, and capped by a small reliquary urn cradling a captive
 * flame — fire gets a real vessel and a structural weave of its own.
 */
export function buildFireIceArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const crystalMat = createStructureMaterial("ice", "crystal", tier);
  const arcaneCrystalMat = createStructureMaterial("arcane", "crystal", tier);
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.6 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.5, intensity: 1.3 });
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.4, intensity: 1.2 });

  const discR = 0.62 + tier * 0.035;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.87, 0.18, 8), crystalMat));
  disc.position.y = 0.34;
  applyMotion(disc, { bobAmp: 0.03, bobSpeed: 1 });
  group.add(disc);

  // Crystal moorings hovering under the disc rim, each now tipped with a
  // small captive ember — fire's own ground-level presence.
  const moorCount = 4 + tier;
  for (let i = 0; i < moorCount; i++) {
    const a = (i / moorCount) * Math.PI * 2 + 0.4;
    const moor = shadowed(new THREE.Mesh(crystalShard(0.055, 0.2, 5), crystalMat));
    moor.position.set(Math.cos(a) * discR * 0.85, 0.2, Math.sin(a) * discR * 0.85);
    moor.rotation.x = Math.PI;
    applyMotion(moor, { bobAmp: 0.02, bobSpeed: 1.3 + i * 0.15, bobPhase: i * 1.3 });
    group.add(moor);

    const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), fireCore);
    ember.position.set(Math.cos(a) * discR * 0.85, 0.11, Math.sin(a) * discR * 0.85);
    applyMotion(ember, { bobAmp: 0.025, bobSpeed: 2.2 + i * 0.2, bobPhase: i });
    group.add(ember);
  }

  const obeliskH = 1.22 + tier * 0.4;
  const pillar = shadowed(new THREE.Mesh(obeliskGeo(0.062, 0.21, obeliskH), crystalMat));
  pillar.position.y = 0.34 + obeliskH / 2;
  group.add(pillar);

  // The captive glow inside the obelisk is split lower-ice/upper-fire — the
  // contradiction the flavor text describes, made spatially literal.
  const iceGlow = new THREE.Mesh(obeliskGeo(0.024, 0.12, obeliskH * 0.56), iceCore);
  iceGlow.position.y = 0.34 + obeliskH * 0.3;
  group.add(iceGlow);
  const fireGlow = new THREE.Mesh(obeliskGeo(0.024, 0.1, obeliskH * 0.5), fireCore);
  fireGlow.position.y = 0.34 + obeliskH * 0.72;
  applyMotion(fireGlow, { spinSpeed: 0.35 });
  group.add(fireGlow);

  // A woven thread climbs the full obelisk face — arcane crystal for the
  // structural weave, a fire glow riding it, exactly the "weaving fire
  // through ice and rune-light" the flavor text names.
  const threadWrap = shadowed(new THREE.Mesh(spiralTube(0.34 + tier * 0.02, obeliskH * 0.92, 2.6 + tier * 0.5, 0.028), arcaneCrystalMat));
  threadWrap.position.y = 0.34;
  group.add(threadWrap);
  const threadGlow = new THREE.Mesh(spiralTube(0.35 + tier * 0.02, obeliskH * 0.92, 2.6 + tier * 0.5, 0.013), fireCore);
  threadGlow.position.y = 0.34;
  group.add(threadGlow);

  const ringCount = tier + 1;
  for (let i = 0; i < ringCount; i++) {
    const mat = i % 2 === 0 ? iceCore : arcaneCore;
    const ring = glyphRing(0.44 + i * 0.16, 5 + i * 2, 0.16, mat);
    ring.position.y = 0.52 + i * 0.3;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.4 + i * 0.1), bobAmp: 0.03, bobSpeed: 1.2 });
    group.add(ring);
  }

  // Reliquary urn crowning the whole structure, cradling a captive flame —
  // fire gets its own vessel at the top, not just an accent glow.
  const crownY = 0.34 + obeliskH + 0.08;
  const urn = shadowed(new THREE.Mesh(plinth(0.15 + tier * 0.02, 0.11, 0.24 + tier * 0.05, 8), arcaneCrystalMat));
  urn.position.y = crownY;
  group.add(urn);
  const urnFlame = new THREE.Mesh(flameLick(0.13 + tier * 0.02, 0.32 + tier * 0.08), fireCore);
  urnFlame.position.y = crownY + 0.18;
  applyMotion(urnFlame, { bobAmp: 0.05, bobSpeed: 2.6 });
  group.add(urnFlame);

  return group;
}

/**
 * Thornfire Maelstrom — fire + lightning + nature (Wildfire Warden +
 * lightning). The same burning living trunk as Wildfire Warden, taller and
 * now wrapped in its own storm coil, with a full ring of storm-thorns
 * jutting past the flame crown — lightning gets the same jutting-spike
 * language as Thornstorm Totem, distinct from the fire vines already there.
 */
export function buildFireLightningNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.5 });
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.4, intensity: 1.5 });

  const baseR = 0.78 + tier * 0.055;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.38, tier), wood));
  base.scale.y = 0.4;
  base.position.y = 0.2;
  group.add(base);

  const rootEmberCount = 4;
  for (let i = 0; i < rootEmberCount; i++) {
    const a = (i / rootEmberCount) * Math.PI * 2 + 0.5;
    const ember = new THREE.Mesh(roughRock(0.07, 0, 0.4, i + 3), fireCore);
    ember.position.set(Math.cos(a) * baseR * 1.05, 0.2, Math.sin(a) * baseR * 1.05);
    applyMotion(ember, { bobAmp: 0.03, bobSpeed: 1.6 + i * 0.2, bobPhase: i });
    group.add(ember);
  }

  // Storm-charged sparks hovering at the base too — lightning's own ground
  // presence, distinct from the smouldering embers.
  const sparkCount = 3;
  for (let i = 0; i < sparkCount; i++) {
    const a = (i / sparkCount) * Math.PI * 2 + 1.2;
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), boltCore);
    spark.position.set(Math.cos(a) * baseR * 0.9, 0.3, Math.sin(a) * baseR * 0.9);
    applyMotion(spark, { bobAmp: 0.025, bobSpeed: 6 + i, bobPhase: i * 2 });
    group.add(spark);
  }

  const trunkH = 1.2 + tier * 0.36;
  const trunk = shadowed(new THREE.Mesh(plinth(0.19, 0.27, trunkH, 7), wood));
  trunk.position.y = 0.36 + trunkH / 2;
  group.add(trunk);

  const fireVine = new THREE.Mesh(spiralTube(0.26, trunkH * 0.95, 2.2 + tier * 0.45, 0.065), fireCore);
  fireVine.position.y = 0.38;
  applyMotion(fireVine, { spinSpeed: -0.2 });
  group.add(fireVine);

  // Storm coil interleaves with the fire vine at a wider radius — lightning's
  // own spiral, kept spatially distinct from the fire so both read clearly.
  const coil = shadowed(new THREE.Mesh(spiralTube(0.32, trunkH * 0.9, 3 + tier * 0.6, 0.03), metal));
  coil.position.y = 0.4;
  group.add(coil);

  const crownY = 0.4 + trunkH;
  const flameCount = 4 + tier * 2;
  for (let i = 0; i < flameCount; i++) {
    const a = (i / flameCount) * Math.PI * 2;
    const flame = new THREE.Mesh(flameLick(0.11, 0.34 + tier * 0.07), fireCore);
    flame.position.set(Math.cos(a) * 0.26, crownY, Math.sin(a) * 0.26);
    applyMotion(flame, { bobAmp: 0.04, bobSpeed: 3 + i * 0.3, bobPhase: i });
    group.add(flame);
  }

  // Storm-thorns ring the crown, jutting past the flame silhouette — the
  // Thornstorm Totem spike+arc-tip language, applied here to give lightning
  // an unmistakable external presence of its own.
  const thornCount = 5 + tier * 2;
  for (let i = 0; i < thornCount; i++) {
    const a = (i / thornCount) * Math.PI * 2;
    const thorn = shadowed(new THREE.Mesh(plinth(0.005, 0.032, 0.32, 5), metal));
    thorn.position.set(Math.cos(a) * 0.36, crownY, Math.sin(a) * 0.36);
    thorn.rotation.z = Math.cos(a) * 1.2;
    thorn.rotation.x = -Math.sin(a) * 1.2;
    group.add(thorn);

    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), boltCore);
    tip.position.set(Math.cos(a) * 0.52, crownY + 0.1, Math.sin(a) * 0.52);
    applyMotion(tip, { bobAmp: 0.02, bobSpeed: 6 + i, bobPhase: i * 2 });
    group.add(tip);
  }

  const core = new THREE.Mesh(flameLick(0.22 + tier * 0.035, 0.64 + tier * 0.18), fireCore);
  core.position.y = crownY + 0.1;
  applyMotion(core, { bobAmp: 0.05, bobSpeed: 2.4 });
  group.add(core);

  const boltOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + tier * 0.028, 1), boltCore);
  boltOrb.position.y = crownY + 0.32 + tier * 0.06;
  applyMotion(boltOrb, { spinSpeed: 1.2 });
  group.add(boltOrb);

  return group;
}

/**
 * Moltenglyph Cauldron — fire + earth + arcane (Magma Forge + arcane). The
 * same molten boulder stack as Magma Forge, taller and now caged by a full
 * lattice of rune-glyph containment rings climbing its height — arcane reads
 * as a structural containment vessel rather than a top-only accent.
 */
export function buildFireEarthArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const fireCore = createElementCoreMaterial("fire", tier, { scale: 2.3 });
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.7, intensity: 1.3 });

  const baseR = 0.9 + tier * 0.06;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.32, tier), stone));
  base.scale.y = 0.44;
  base.position.y = 0.22;
  group.add(base);

  const dropletCount = 4;
  for (let i = 0; i < dropletCount; i++) {
    const a = (i / dropletCount) * Math.PI * 2 + 0.5;
    const droplet = new THREE.Mesh(roughRock(0.07, 0, 0.4, i + 4), fireCore);
    droplet.position.set(Math.cos(a) * baseR * 1.05, 0.16, Math.sin(a) * baseR * 1.05);
    applyMotion(droplet, { bobAmp: 0.025, bobSpeed: 1.3 + i * 0.2, bobPhase: i });
    group.add(droplet);
  }

  // Rune sigils etched flat into the ground ring — arcane's own ground-level
  // presence, distinct from the molten droplets.
  const sigilCount = 4;
  for (let i = 0; i < sigilCount; i++) {
    const a = (i / sigilCount) * Math.PI * 2 + 1.1;
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), arcaneCore);
    sigil.position.set(Math.cos(a) * baseR * 0.75, 0.03, Math.sin(a) * baseR * 0.75);
    sigil.rotation.x = -Math.PI / 2;
    group.add(sigil);
  }

  const boulderCount = tier + 2;
  let y = 0.42;
  for (let i = 0; i < boulderCount; i++) {
    const r = 0.56 - i * 0.08;
    const geo = roughRock(r, 1, 0.32, i * 2.7);
    const boulder = shadowed(new THREE.Mesh(geo, stone));
    boulder.position.y = y + r * 0.7;
    group.add(boulder);

    const moltenShell = new THREE.Mesh(roughRock(r * 1.02, 1, 0.32, i * 2.7), fireCore);
    moltenShell.position.copy(boulder.position);
    group.add(moltenShell);
    y += r * 1.22;
  }

  // Rune-glyph containment rings cage the boulder stack like a cauldron —
  // arcane's own clearly legible structural geometry, climbing the height
  // instead of sitting only at the top.
  const ringCount = tier + 1;
  for (let i = 0; i < ringCount; i++) {
    const ring = glyphRing(0.5 + i * 0.14, 5 + i * 2, 0.16, arcaneCore);
    ring.position.y = 0.55 + (i / ringCount) * (y - 0.55);
    ring.rotation.x = (i % 2) * 0.2;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.12) });
    group.add(ring);
  }

  const ventTop = new THREE.Mesh(flameLick(0.2 + tier * 0.03, 0.5 + tier * 0.16), fireCore);
  ventTop.position.y = y + 0.08;
  applyMotion(ventTop, { bobAmp: 0.04, bobSpeed: 2.6 });
  group.add(ventTop);

  const capOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + tier * 0.03, 1), arcaneCore);
  capOrb.position.y = y + 0.3 + tier * 0.06;
  applyMotion(capOrb, { spinSpeed: 0.5, bobAmp: 0.05, bobSpeed: 1.5 });
  group.add(capOrb);

  return group;
}

/**
 * Rimethorn Cyclone — ice + lightning + nature (Thornstorm Totem + ice).
 * The same storm-thorn totem as Thornstorm Totem, taller and now sheathed in
 * a rime-ice band mid-trunk, crowned by a whirling ring of orbiting ice
 * shards — ice gets its own fast-spinning cyclone geometry, distinct from
 * the totem's static thorns.
 */
export function buildIceLightningNatureTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const wood = createStructureMaterial("nature", "wood", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.5, intensity: 1.4 });
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.7 });

  const baseR = 0.74 + tier * 0.055;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), wood));
  base.scale.y = 0.36;
  base.position.y = 0.16;
  group.add(base);

  // Rime-frost shards jutting from the base — ice's own ground-level
  // presence, distinct from the wood and metal already there.
  const frostCount = 4;
  for (let i = 0; i < frostCount; i++) {
    const a = (i / frostCount) * Math.PI * 2 + 0.3;
    const frost = shadowed(new THREE.Mesh(crystalShard(0.08, 0.24, 5), iceCrystal));
    frost.position.set(Math.cos(a) * baseR * 1.02, 0.16, Math.sin(a) * baseR * 1.02);
    frost.rotation.z = Math.cos(a) * 0.6;
    frost.rotation.x = -Math.sin(a) * 0.6;
    group.add(frost);
  }

  const trunkH = 1.15 + tier * 0.34;
  const trunk = shadowed(new THREE.Mesh(plinth(0.18, 0.25, trunkH, 7), wood));
  trunk.position.y = 0.32 + trunkH / 2;
  group.add(trunk);

  // Rime-ice sheath fused mid-trunk — the storm cloud's frost, made solid
  // and structural (same technique as Elderfrost Sanctum's iceSheath).
  const iceSheath = shadowed(new THREE.Mesh(plinth(0.23, 0.32, trunkH * 0.5, 7), iceCrystal));
  iceSheath.position.y = 0.34 + trunkH * 0.26;
  group.add(iceSheath);

  const coil = shadowed(new THREE.Mesh(spiralTube(0.26, trunkH * 0.95, 2 + tier * 0.5, 0.032), metal));
  coil.position.y = 0.34;
  group.add(coil);

  const crownY = 0.36 + trunkH;
  const thornCount = 5 + tier * 2;
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

  // Whirling cyclone of ice shards orbiting the crown — fast independent
  // spin per holder is what sells "cyclone" rather than a static ring.
  const cycloneCount = 6 + tier * 2;
  for (let i = 0; i < cycloneCount; i++) {
    const a = (i / cycloneCount) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.y = crownY + 0.06;
    const shard = shadowed(new THREE.Mesh(crystalShard(0.05, 0.24 + (i % 2) * 0.08, 5), iceCrystal));
    shard.position.set(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52);
    shard.rotation.z = Math.PI / 2.4;
    holder.add(shard);
    applyMotion(holder, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (1.0 + i * 0.1) });
    group.add(holder);
  }

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17 + tier * 0.028, 1), boltCore);
  orb.position.y = crownY + 0.22;
  applyMotion(orb, { spinSpeed: 1.3 });
  group.add(orb);
  const iceOrbShell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21 + tier * 0.03, 0), iceCore);
  iceOrbShell.position.y = crownY + 0.22;
  applyMotion(iceOrbShell, { spinSpeed: -0.6 });
  group.add(iceOrbShell);

  return group;
}

/**
 * Glacequake Redoubt — ice + lightning + earth (Seismic Coil + ice). The
 * same coil-wrapped fault-cracked pillar as Seismic Coil, taller and now
 * fused mid-height with a frozen band, its orbiting rubble replaced by
 * shattered ice chunks — ice gets a real frozen mass, not a surface tint.
 */
export function buildIceLightningEarthTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier);
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.2 });
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.8, intensity: 1.2 });

  const baseR = 0.82 + tier * 0.055;
  const base = shadowed(new THREE.Mesh(roughRock(baseR, 1, 0.3, tier), stone));
  base.scale.y = 0.4;
  base.position.y = 0.18;
  group.add(base);

  const crack = new THREE.Mesh(roughRock(baseR * 1.02, 1, 0.3, tier), boltCore);
  crack.scale.copy(base.scale);
  crack.position.copy(base.position);
  group.add(crack);

  // Shattered ice rubble at the base, present from tier 1 — ice's own
  // ground-level mass, distinct from the stone and lightning crack.
  const rubbleCount = 3;
  for (let i = 0; i < rubbleCount; i++) {
    const a = (i / rubbleCount) * Math.PI * 2 + 0.7;
    const rubble = shadowed(new THREE.Mesh(crystalShard(0.1, 0.32, 5), iceCrystal));
    rubble.position.set(Math.cos(a) * baseR * 1.05, 0.14, Math.sin(a) * baseR * 1.05);
    rubble.rotation.z = Math.cos(a) * 0.5;
    group.add(rubble);
  }

  const pillarH = 1.1 + tier * 0.36;
  const pillar = shadowed(new THREE.Mesh(plinth(0.27, 0.36, pillarH, 8), stone));
  pillar.position.y = 0.36 + pillarH / 2;
  group.add(pillar);

  // Frozen band fused mid-pillar — the tremor caught and locked in ice,
  // exactly as the flavor text describes.
  const iceShellH = pillarH * 0.55;
  const iceShell = shadowed(new THREE.Mesh(plinth(0.275, 0.366, iceShellH, 8), iceCrystal));
  iceShell.position.y = 0.36 + pillarH * 0.3;
  group.add(iceShell);

  const coil = shadowed(new THREE.Mesh(spiralTube(0.3, pillarH * 0.9, 3 + tier, 0.03), metal));
  coil.position.y = 0.36;
  group.add(coil);

  const orbitCount = tier + 1;
  for (let i = 0; i < orbitCount; i++) {
    const holder = new THREE.Group();
    holder.position.set(0, 0.4 + pillarH * 0.6, 0);
    const chunk = shadowed(new THREE.Mesh(crystalShard(0.08, 0.24, 5), iceCrystal));
    chunk.position.set(0.48, 0, 0);
    holder.add(chunk);
    const arc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.036, 0), boltCore);
    arc.position.set(0.48, 0.07, 0);
    holder.add(arc);
    applyMotion(holder, { spinSpeed: 0.5 + i * 0.15 });
    group.add(holder);
  }

  // Ice-shattered cap where the quake bursts up through frozen rock.
  const crownY = 0.4 + pillarH + 0.06;
  const capBoulder = shadowed(new THREE.Mesh(roughRock(0.22 + tier * 0.025, 1, 0.34, 9), stone));
  capBoulder.position.y = crownY;
  group.add(capBoulder);
  const capIce = new THREE.Mesh(crystalShard(0.17 + tier * 0.02, 0.42 + tier * 0.12, 6), iceCore);
  capIce.position.y = crownY + 0.14;
  applyMotion(capIce, { bobAmp: 0.03, bobSpeed: 2 });
  group.add(capIce);
  const boltCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + tier * 0.025, 1), boltCore);
  boltCrown.position.y = crownY + 0.32;
  applyMotion(boltCrown, { spinSpeed: -1.0 });
  group.add(boltCrown);

  return group;
}

/**
 * Frostbound Ossuary — ice + earth + arcane (Runeforge Monolith + ice). The
 * same rune-riveted stone slab as Runeforge Monolith, taller and now
 * sheathed in a frozen shell across its lower half, hung with real icicles —
 * ice gets a real encasing mass, distinct from the glyphs and rivets.
 */
export function buildIceEarthArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const stone = createStructureMaterial("earth", "stone", tier);
  const metal = createStructureMaterial("lightning", "metal", tier); // rivet accents, tinted neutral metal (matches parent)
  const iceCrystal = createStructureMaterial("ice", "crystal", tier);
  const arcaneCore = createElementCoreMaterial("arcane", tier, { scale: 1.8 });
  const iceCore = createElementCoreMaterial("ice", tier, { scale: 1.7, intensity: 1.15 });

  const discR = 0.68 + tier * 0.035;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.88, 0.2, 8), stone));
  disc.position.y = 0.36;
  applyMotion(disc, { bobAmp: 0.02, bobSpeed: 0.9 });
  group.add(disc);

  // Frost creeping across the disc rim, present from tier 1 — ice's own
  // ground-level presence.
  const rimFrostCount = 4;
  for (let i = 0; i < rimFrostCount; i++) {
    const a = (i / rimFrostCount) * Math.PI * 2 + 0.6;
    const frost = shadowed(new THREE.Mesh(crystalShard(0.06, 0.2, 5), iceCrystal));
    frost.position.set(Math.cos(a) * discR * 0.85, 0.28, Math.sin(a) * discR * 0.85);
    frost.rotation.z = Math.cos(a) * 0.5;
    group.add(frost);
  }

  const slabH = 1.35 + tier * 0.44;
  const slab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.56, slabH, 0.22), stone));
  slab.position.y = 0.36 + slabH / 2;
  group.add(slab);

  const glyphCount = 3 + tier;
  for (let i = 0; i < glyphCount; i++) {
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), arcaneCore);
    glyph.position.set(0, 0.54 + (i / glyphCount) * slabH, 0.12);
    group.add(glyph);
    const glyphBack = glyph.clone();
    glyphBack.position.z = -0.12;
    glyphBack.rotation.y = Math.PI;
    group.add(glyphBack);
  }

  // Frozen shell sheathes the lower half of the slab — the encasement the
  // flavor text describes, glyphs still visible glowing beneath it.
  const iceShellH = slabH * 0.5;
  const iceShell = new THREE.Mesh(new THREE.BoxGeometry(0.58, iceShellH, 0.235), iceCrystal);
  iceShell.position.y = 0.36 + iceShellH / 2;
  group.add(iceShell);

  // Motes of trapped frost-light embedded in the shell — ice's own glow,
  // distinct from the arcane glyphs it's encasing.
  const frostMoteCount = 2 + tier;
  for (let i = 0; i < frostMoteCount; i++) {
    const mote = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), iceCore);
    mote.position.set(0.16 * (i % 2 === 0 ? 1 : -1), 0.4 + (i / frostMoteCount) * iceShellH, 0.13);
    applyMotion(mote, { bobAmp: 0.02, bobSpeed: 1.6 + i * 0.2, bobPhase: i });
    group.add(mote);
  }

  // Real icicles hang from the ice shell's upper edge.
  const icicleCount = 5 + tier;
  for (let i = 0; i < icicleCount; i++) {
    const t = i / (icicleCount - 1);
    const icicle = shadowed(new THREE.Mesh(crystalShard(0.045, 0.22 + (i % 2) * 0.1, 5), iceCrystal));
    icicle.position.set((t - 0.5) * 0.5, 0.36 + iceShellH, 0.13);
    icicle.rotation.x = Math.PI;
    group.add(icicle);
  }

  const rivetCount = 5 + tier * 2;
  for (let i = 0; i < rivetCount; i++) {
    const rivet = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), metal));
    const side = i % 2 === 0 ? 1 : -1;
    rivet.position.set(0.27 * side, 0.44 + (i / rivetCount) * slabH, 0.11);
    group.add(rivet);
  }

  const topOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14 + tier * 0.028, 1), arcaneCore);
  topOrb.position.y = 0.5 + slabH;
  applyMotion(topOrb, { spinSpeed: 0.5, bobAmp: 0.05, bobSpeed: 1.5 });
  group.add(topOrb);

  // Frozen halo crowning the orb — ice's own crown presence, not just a
  // sheath lower down.
  const iceHalo = shadowed(new THREE.Mesh(ringBand(0.24 + tier * 0.03, 0.02, 6, 20), iceCrystal));
  iceHalo.position.y = 0.5 + slabH;
  iceHalo.rotation.x = Math.PI / 2;
  applyMotion(iceHalo, { spinSpeed: 0.7 });
  group.add(iceHalo);

  return group;
}

/**
 * Bramblecharge Conclave — lightning + nature + arcane (Arcflux Spire +
 * nature). The same sleek conduit spire as Arcflux Spire, taller and now
 * consumed by a living bramble vine climbing its lower two-thirds — nature
 * gets a real structural takeover, not a decorative sprout, while the
 * lightning/arcane spire core still crowns the very top.
 */
export function buildLightningNatureArcaneTower(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  const metal = createStructureMaterial("lightning", "metal", tier);
  const crystalMat = createStructureMaterial("arcane", "crystal", tier);
  const wood = createStructureMaterial("nature", "wood", tier);
  const boltCore = createElementCoreMaterial("lightning", tier, { scale: 3.5, intensity: 1.4 });
  const vineCore = createElementCoreMaterial("nature", tier, { scale: 2.4, intensity: 1.1 });

  const discR = 0.64 + tier * 0.035;
  const disc = shadowed(new THREE.Mesh(plinth(discR, discR * 0.87, 0.18, 10), metal));
  disc.position.y = 0.34;
  applyMotion(disc, { bobAmp: 0.02, bobSpeed: 1.4 });
  group.add(disc);

  // Bramble roots have cracked the disc rim, present from tier 1 — nature's
  // own ground-level presence, budding even here.
  const rootCount = 4;
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + 0.4;
    const root = shadowed(new THREE.Mesh(spiralTube(0.05, 0.2, 1.2, 0.024), wood));
    root.position.set(Math.cos(a) * discR * 0.82, 0.2, Math.sin(a) * discR * 0.82);
    group.add(root);
    const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.048, 0), vineCore);
    bud.position.set(Math.cos(a) * discR * 0.82, 0.35, Math.sin(a) * discR * 0.82);
    applyMotion(bud, { bobAmp: 0.03, bobSpeed: 1.6 + i * 0.2, bobPhase: i });
    group.add(bud);
  }

  const spireH = 1.3 + tier * 0.42;
  const spire = shadowed(new THREE.Mesh(obeliskGeo(0.055, 0.2, spireH), crystalMat));
  spire.position.y = 0.34 + spireH / 2;
  group.add(spire);

  const glow = new THREE.Mesh(obeliskGeo(0.022, 0.12, spireH * 0.94), boltCore);
  glow.position.copy(spire.position);
  applyMotion(glow, { spinSpeed: 1.0 });
  group.add(glow);

  // Living bramble climbs the spire's lower two-thirds — nature takes real
  // structural mass instead of decorating the crown only, the "consumed by
  // storm-charged bramble" the flavor text names.
  const vineWrap = shadowed(new THREE.Mesh(spiralTube(0.36 + tier * 0.03, spireH * 0.7, 2.4 + tier * 0.5, 0.042), wood));
  vineWrap.position.y = 0.4;
  group.add(vineWrap);
  const vineGlow = new THREE.Mesh(spiralTube(0.37 + tier * 0.03, spireH * 0.7, 2.4 + tier * 0.5, 0.018), vineCore);
  vineGlow.position.y = 0.4;
  group.add(vineGlow);

  const leafCount = 4 + tier * 2;
  for (let i = 0; i < leafCount; i++) {
    const t = (i % 5) / 5;
    const a = (i / leafCount) * Math.PI * 2;
    const leaf = shadowed(new THREE.Mesh(roughRock(0.1, 0, 0.3, i), wood));
    leaf.scale.set(1.3, 0.4, 1);
    leaf.position.set(Math.cos(a) * (0.4 + tier * 0.02), 0.4 + t * spireH * 0.65, Math.sin(a) * (0.4 + tier * 0.02));
    group.add(leaf);
  }

  // Coil rings kept only near the top, where the vine hasn't reached —
  // lightning/arcane's original presence still legible above the bramble.
  const ringCount = tier + 1;
  for (let i = 0; i < ringCount; i++) {
    const ringY = 0.34 + spireH * 0.74 + i * 0.14;
    const ring = shadowed(new THREE.Mesh(spiralTube(0.3 + i * 0.05, 0.02, 1, 0.02, 32), metal));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ringY;
    applyMotion(ring, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.15) });
    group.add(ring);

    const sparkCount = 3;
    for (let s = 0; s < sparkCount; s++) {
      const a = (s / sparkCount) * Math.PI * 2 + i;
      const holder = new THREE.Group();
      holder.position.y = ringY;
      const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), boltCore);
      spark.position.set(Math.cos(a) * (0.3 + i * 0.05), 0, Math.sin(a) * (0.3 + i * 0.05));
      holder.add(spark);
      applyMotion(holder, { spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.15) });
      group.add(holder);
    }
  }

  // Crown of storm-charged bramble blossoms — the "conclave" gathering
  // motif, nature and lightning fused in the same cluster at the very top.
  const crownY = 0.34 + spireH + 0.1;
  const blossomCount = 3 + tier * 2;
  for (let i = 0; i < blossomCount; i++) {
    const a = (i / blossomCount) * Math.PI * 2;
    const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + (i % 2) * 0.02, 0), vineCore);
    blossom.position.set(Math.cos(a) * 0.22, crownY, Math.sin(a) * 0.22);
    applyMotion(blossom, { bobAmp: 0.03, bobSpeed: 2.4 + i * 0.25, bobPhase: i });
    group.add(blossom);

    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), boltCore);
    spark.position.set(Math.cos(a) * 0.3, crownY + 0.08, Math.sin(a) * 0.3);
    applyMotion(spark, { bobAmp: 0.025, bobSpeed: 5 + i, bobPhase: i * 2 });
    group.add(spark);
  }

  const apexThorn = shadowed(new THREE.Mesh(plinth(0.02, 0.06, 0.34 + tier * 0.1, 6), wood));
  apexThorn.position.y = crownY + 0.2;
  group.add(apexThorn);
  const apexOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14 + tier * 0.025, 1), boltCore);
  apexOrb.position.y = crownY + 0.4 + tier * 0.05;
  applyMotion(apexOrb, { spinSpeed: 1.2 });
  group.add(apexOrb);

  return group;
}
