import * as THREE from "three";
import {
  buildArcaneTower,
  buildEarthTower,
  buildFireTower,
  buildIceTower,
  buildLightningTower,
  buildNatureTower,
} from "./models/elementModels";
import {
  buildEarthArcaneTower,
  buildFireArcaneTower,
  buildFireEarthTower,
  buildFireIceTower,
  buildFireLightningTower,
  buildFireNatureTower,
  buildIceArcaneTower,
  buildIceEarthTower,
  buildIceLightningTower,
  buildIceNatureTower,
  buildLightningArcaneTower,
  buildLightningEarthTower,
  buildLightningNatureTower,
  buildNatureArcaneTower,
  buildNatureEarthTower,
} from "./models/fusionModels";

export { animateTowerModel } from "./models/motion";
export { updateTowerVfxTime, releaseTowerCoreMaterial } from "@/game/towers/shaders/coreMaterial";

type ModelBuilder = (tier: 1 | 2 | 3) => THREE.Group;

/**
 * Registry key === TowerDef.modelId (which TowerRegistry.ts sets equal to the
 * tower's own `id`). Keeping the two identical means callers never have to
 * look anything else up: `createTowerModel(towerDef.modelId, tier)`.
 */
const MODEL_BUILDERS: Record<string, ModelBuilder> = {
  // base elemental towers
  tower_fire: buildFireTower,
  tower_ice: buildIceTower,
  tower_lightning: buildLightningTower,
  tower_nature: buildNatureTower,
  tower_earth: buildEarthTower,
  tower_arcane: buildArcaneTower,

  // fusion towers (id order mirrors ELEMENTS pair enumeration in FusionMatrix.ts)
  tower_fire_ice: buildFireIceTower,
  tower_fire_lightning: buildFireLightningTower,
  tower_fire_nature: buildFireNatureTower,
  tower_fire_earth: buildFireEarthTower,
  tower_fire_arcane: buildFireArcaneTower,
  tower_ice_lightning: buildIceLightningTower,
  tower_ice_nature: buildIceNatureTower,
  tower_ice_earth: buildIceEarthTower,
  tower_ice_arcane: buildIceArcaneTower,
  tower_lightning_nature: buildLightningNatureTower,
  tower_lightning_earth: buildLightningEarthTower,
  tower_lightning_arcane: buildLightningArcaneTower,
  tower_nature_earth: buildNatureEarthTower,
  tower_nature_arcane: buildNatureArcaneTower,
  tower_earth_arcane: buildEarthArcaneTower,
};

/**
 * Build a fresh procedural THREE.Group for the given tower id and tier.
 * Every call returns a new group/geometry/material set — callers that place
 * many towers of the same id+tier may want to cache-and-clone if geometry
 * duplication becomes a profiling concern, but nothing here is shared state
 * (other than the module-level core-material time registry, see
 * updateTowerVfxTime) so it's always safe to call fresh.
 */
export function createTowerModel(towerId: string, tier: 1 | 2 | 3): THREE.Group {
  const builder = MODEL_BUILDERS[towerId];
  if (!builder) {
    throw new Error(`createTowerModel: no model builder registered for tower id "${towerId}"`);
  }
  const group = builder(tier);
  group.name = `${towerId}__tier${tier}`;
  return group;
}

/** All tower ids with a registered model builder — useful for gallery/QA harnesses. */
export function listModeledTowerIds(): string[] {
  return Object.keys(MODEL_BUILDERS);
}
