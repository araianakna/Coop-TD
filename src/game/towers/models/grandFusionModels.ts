import * as THREE from "three";
import { createElementCoreMaterial } from "@/game/towers/shaders/coreMaterial";
import { createStructureMaterial } from "@/game/towers/shaders/structureMaterial";
import { applyMotion } from "./motion";
import { crystalShard, flameLick, glyphRing, plinth, ringBand, roughRock, spiralTube } from "./primitives";

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
