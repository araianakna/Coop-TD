import type { Element } from "@/game/types";

/**
 * Maps a "merge tier 2" recipe — an existing fusion tower plus a third base
 * element it doesn't already contain — to the resulting Grand Fusion tower
 * id. Kept separate from FusionMatrix.ts (which only handles the base 15
 * two-element recipes) so the two lookup tables stay easy to reason about
 * independently: FusionMatrix answers "which 2 elements make this fusion",
 * this file answers "which fusion + which 3rd element makes this capstone".
 *
 * There are C(6,3) = 20 possible element triads. This list is now
 * exhaustive: the original 6 (see TowerRegistry.ts's Grand Fusion section
 * for why those were chosen), a second curation pass of 6 more (see the
 * "second curation pass" comment further down that same section), and a
 * third curation pass of the final 8 (see the "third curation pass" comment
 * further down that section) together cover all 20 triads. The matrix is
 * combinatorially complete — every (fusion, element) pair below resolves,
 * and there is no 21st triad left to add.
 *
 * Where a triad was reachable via more than one parent-fusion + third-
 * element path (most are — a triad of 3 elements contains 3 different
 * 2-element pairs, any of which could be the "parent"), the path was chosen
 * for the strongest name/flavor/visual concept and to spread which of the
 * 15 base fusions get used as a Grand Fusion parent, rather than reusing the
 * same few repeatedly. See `listGrandFusionParentIds()` below to check
 * current parent coverage.
 */
export interface GrandFusionRecipe {
  /** TowerDef.id of the 2-element fusion tower being merged. */
  parentFusionTowerId: string;
  /** The third base element merged in, distinct from both elements already in the parent fusion. */
  thirdElement: Element;
  /** TowerDef.id of the resulting Grand Fusion tower. */
  resultTowerId: string;
}

export const GRAND_FUSION_RECIPES: GrandFusionRecipe[] = [
  { parentFusionTowerId: "tower_fire_ice", thirdElement: "lightning", resultTowerId: "tower_fire_ice_lightning" },
  { parentFusionTowerId: "tower_fire_earth", thirdElement: "nature", resultTowerId: "tower_fire_nature_earth" },
  { parentFusionTowerId: "tower_ice_nature", thirdElement: "arcane", resultTowerId: "tower_ice_nature_arcane" },
  {
    parentFusionTowerId: "tower_earth_arcane",
    thirdElement: "lightning",
    resultTowerId: "tower_lightning_earth_arcane",
  },
  {
    parentFusionTowerId: "tower_fire_lightning",
    thirdElement: "arcane",
    resultTowerId: "tower_fire_lightning_arcane",
  },
  { parentFusionTowerId: "tower_ice_earth", thirdElement: "nature", resultTowerId: "tower_ice_nature_earth" },

  // Second curation pass — 6 more of the remaining 14 uncovered triads.
  { parentFusionTowerId: "tower_fire_ice", thirdElement: "nature", resultTowerId: "tower_fire_ice_nature" },
  {
    parentFusionTowerId: "tower_ice_lightning",
    thirdElement: "arcane",
    resultTowerId: "tower_ice_lightning_arcane",
  },
  {
    parentFusionTowerId: "tower_lightning_earth",
    thirdElement: "fire",
    resultTowerId: "tower_fire_lightning_earth",
  },
  {
    parentFusionTowerId: "tower_nature_earth",
    thirdElement: "arcane",
    resultTowerId: "tower_nature_earth_arcane",
  },
  {
    parentFusionTowerId: "tower_lightning_nature",
    thirdElement: "earth",
    resultTowerId: "tower_lightning_nature_earth",
  },
  { parentFusionTowerId: "tower_fire_arcane", thirdElement: "nature", resultTowerId: "tower_fire_nature_arcane" },

  // Third curation pass — the final 8 triads, completing the full C(6,3) = 20
  // set. See TowerRegistry.ts's "third curation pass" comment for rationale.
  { parentFusionTowerId: "tower_ice_earth", thirdElement: "fire", resultTowerId: "tower_fire_ice_earth" },
  { parentFusionTowerId: "tower_ice_arcane", thirdElement: "fire", resultTowerId: "tower_fire_ice_arcane" },
  {
    parentFusionTowerId: "tower_fire_nature",
    thirdElement: "lightning",
    resultTowerId: "tower_fire_lightning_nature",
  },
  { parentFusionTowerId: "tower_fire_earth", thirdElement: "arcane", resultTowerId: "tower_fire_earth_arcane" },
  {
    parentFusionTowerId: "tower_lightning_nature",
    thirdElement: "ice",
    resultTowerId: "tower_ice_lightning_nature",
  },
  { parentFusionTowerId: "tower_lightning_earth", thirdElement: "ice", resultTowerId: "tower_ice_lightning_earth" },
  { parentFusionTowerId: "tower_earth_arcane", thirdElement: "ice", resultTowerId: "tower_ice_earth_arcane" },
  {
    parentFusionTowerId: "tower_lightning_arcane",
    thirdElement: "nature",
    resultTowerId: "tower_lightning_nature_arcane",
  },
];

function recipeKey(parentFusionTowerId: string, thirdElement: Element): string {
  return `${parentFusionTowerId}+${thirdElement}`;
}

const GRAND_FUSION_LOOKUP = new Map<string, GrandFusionRecipe>(
  GRAND_FUSION_RECIPES.map((r) => [recipeKey(r.parentFusionTowerId, r.thirdElement), r]),
);

/** Look up the Grand Fusion recipe for a parent fusion tower id + third element. Returns undefined if this triad has no curated Grand Fusion. */
export function getGrandFusionRecipe(parentFusionTowerId: string, thirdElement: Element): GrandFusionRecipe | undefined {
  return GRAND_FUSION_LOOKUP.get(recipeKey(parentFusionTowerId, thirdElement));
}

/** Resolve the resulting Grand Fusion tower id for a parent fusion tower id + third element, or undefined if there is no such recipe. */
export function getGrandFusionTowerId(parentFusionTowerId: string, thirdElement: Element): string | undefined {
  return getGrandFusionRecipe(parentFusionTowerId, thirdElement)?.resultTowerId;
}

/** All base fusion tower ids that participate in at least one curated Grand Fusion recipe. */
export function listGrandFusionParentIds(): string[] {
  return Array.from(new Set(GRAND_FUSION_RECIPES.map((r) => r.parentFusionTowerId)));
}
