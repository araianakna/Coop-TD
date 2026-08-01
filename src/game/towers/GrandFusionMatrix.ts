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

  // Duplicate-parent Grand Fusions — a same-element "Twin" fusion (see
  // DuplicateFusionMatrix.ts) merged with a THIRD, distinct base element
  // (e.g. fire+fire, then + ice), rather than two distinct fusion elements.
  // A curated first pass (4 of the many possible twin+distinct-third
  // combinations), same convention as every other curation pass in this
  // file: not exhaustive, extensible later.
  { parentFusionTowerId: "tower_fire_fire", thirdElement: "ice", resultTowerId: "tower_fire_fire_ice" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "shadow", resultTowerId: "tower_ice_ice_shadow" },
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "nature",
    resultTowerId: "tower_lightning_lightning_nature",
  },
  { parentFusionTowerId: "tower_shadow_shadow", thirdElement: "fire", resultTowerId: "tower_shadow_shadow_fire" },

  // Non-duplicate Shadow Grand Fusions — a shadow cross-fusion (or an
  // existing non-shadow fusion) merged with a third distinct element, same
  // curated-first-pass convention as everywhere else in this file.
  { parentFusionTowerId: "tower_earth_shadow", thirdElement: "arcane", resultTowerId: "tower_earth_arcane_shadow" },
  { parentFusionTowerId: "tower_nature_arcane", thirdElement: "shadow", resultTowerId: "tower_nature_arcane_shadow" },

  // Full completion pass — every remaining distinct-element triad now that
  // Shadow is in the roster. C(7,3) = 35 total triads; 22 were covered
  // above (the original 20 among the first 6 elements, plus the 2 just
  // above). These 13 are every remaining triad, all necessarily containing
  // Shadow (every non-Shadow triad was already covered pre-Shadow). Parent
  // is always the existing fusion of the two non-Shadow elements, third
  // element is always Shadow — a consistent, easy-to-audit path since
  // completeness (not parent variety) is the goal for this pass.
  { parentFusionTowerId: "tower_fire_ice", thirdElement: "shadow", resultTowerId: "tower_fire_ice_shadow" },
  { parentFusionTowerId: "tower_fire_lightning", thirdElement: "shadow", resultTowerId: "tower_fire_lightning_shadow" },
  { parentFusionTowerId: "tower_fire_nature", thirdElement: "shadow", resultTowerId: "tower_fire_nature_shadow" },
  { parentFusionTowerId: "tower_fire_earth", thirdElement: "shadow", resultTowerId: "tower_fire_earth_shadow" },
  { parentFusionTowerId: "tower_fire_arcane", thirdElement: "shadow", resultTowerId: "tower_fire_arcane_shadow" },
  { parentFusionTowerId: "tower_ice_lightning", thirdElement: "shadow", resultTowerId: "tower_ice_lightning_shadow" },
  { parentFusionTowerId: "tower_ice_nature", thirdElement: "shadow", resultTowerId: "tower_ice_nature_shadow" },
  { parentFusionTowerId: "tower_ice_earth", thirdElement: "shadow", resultTowerId: "tower_ice_earth_shadow" },
  { parentFusionTowerId: "tower_ice_arcane", thirdElement: "shadow", resultTowerId: "tower_ice_arcane_shadow" },
  {
    parentFusionTowerId: "tower_lightning_nature",
    thirdElement: "shadow",
    resultTowerId: "tower_lightning_nature_shadow",
  },
  {
    parentFusionTowerId: "tower_lightning_earth",
    thirdElement: "shadow",
    resultTowerId: "tower_lightning_earth_shadow",
  },
  {
    parentFusionTowerId: "tower_lightning_arcane",
    thirdElement: "shadow",
    resultTowerId: "tower_lightning_arcane_shadow",
  },
  { parentFusionTowerId: "tower_nature_earth", thirdElement: "shadow", resultTowerId: "tower_nature_earth_shadow" },

  // Duplicate-parent completion, batch 1 — every remaining fire+fire+Y and
  // ice+ice+Y combination (fire+fire+ice and ice+ice+shadow were already
  // done). 7 elements x 6 possible thirds = 42 total duplicate-parent
  // triads; this batch plus the 4 already done brings the running total to
  // 14/42. See TowerRegistry.ts's matching section for the towers.
  {
    parentFusionTowerId: "tower_fire_fire",
    thirdElement: "lightning",
    resultTowerId: "tower_fire_fire_lightning",
  },
  { parentFusionTowerId: "tower_fire_fire", thirdElement: "nature", resultTowerId: "tower_fire_fire_nature" },
  { parentFusionTowerId: "tower_fire_fire", thirdElement: "earth", resultTowerId: "tower_fire_fire_earth" },
  { parentFusionTowerId: "tower_fire_fire", thirdElement: "arcane", resultTowerId: "tower_fire_fire_arcane" },
  { parentFusionTowerId: "tower_fire_fire", thirdElement: "shadow", resultTowerId: "tower_fire_fire_shadow" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "fire", resultTowerId: "tower_ice_ice_fire" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "lightning", resultTowerId: "tower_ice_ice_lightning" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "nature", resultTowerId: "tower_ice_ice_nature" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "earth", resultTowerId: "tower_ice_ice_earth" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "arcane", resultTowerId: "tower_ice_ice_arcane" },

  // Duplicate-parent completion, batch 2 — every remaining
  // lightning+lightning+Y and nature+nature+Y (lightning+lightning+nature
  // was already done). Running total after this batch: 25/42.
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "fire",
    resultTowerId: "tower_lightning_lightning_fire",
  },
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "ice",
    resultTowerId: "tower_lightning_lightning_ice",
  },
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "earth",
    resultTowerId: "tower_lightning_lightning_earth",
  },
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "arcane",
    resultTowerId: "tower_lightning_lightning_arcane",
  },
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "shadow",
    resultTowerId: "tower_lightning_lightning_shadow",
  },
  { parentFusionTowerId: "tower_nature_nature", thirdElement: "fire", resultTowerId: "tower_nature_nature_fire" },
  { parentFusionTowerId: "tower_nature_nature", thirdElement: "ice", resultTowerId: "tower_nature_nature_ice" },
  {
    parentFusionTowerId: "tower_nature_nature",
    thirdElement: "lightning",
    resultTowerId: "tower_nature_nature_lightning",
  },
  { parentFusionTowerId: "tower_nature_nature", thirdElement: "earth", resultTowerId: "tower_nature_nature_earth" },
  {
    parentFusionTowerId: "tower_nature_nature",
    thirdElement: "arcane",
    resultTowerId: "tower_nature_nature_arcane",
  },
  {
    parentFusionTowerId: "tower_nature_nature",
    thirdElement: "shadow",
    resultTowerId: "tower_nature_nature_shadow",
  },

  // Duplicate-parent completion, batch 3 — every earth+earth+Y and
  // arcane+arcane+Y (neither had any prior coverage). Running total after
  // this batch: 37/42.
  { parentFusionTowerId: "tower_earth_earth", thirdElement: "fire", resultTowerId: "tower_earth_earth_fire" },
  { parentFusionTowerId: "tower_earth_earth", thirdElement: "ice", resultTowerId: "tower_earth_earth_ice" },
  {
    parentFusionTowerId: "tower_earth_earth",
    thirdElement: "lightning",
    resultTowerId: "tower_earth_earth_lightning",
  },
  { parentFusionTowerId: "tower_earth_earth", thirdElement: "nature", resultTowerId: "tower_earth_earth_nature" },
  { parentFusionTowerId: "tower_earth_earth", thirdElement: "arcane", resultTowerId: "tower_earth_earth_arcane" },
  { parentFusionTowerId: "tower_earth_earth", thirdElement: "shadow", resultTowerId: "tower_earth_earth_shadow" },
  { parentFusionTowerId: "tower_arcane_arcane", thirdElement: "fire", resultTowerId: "tower_arcane_arcane_fire" },
  { parentFusionTowerId: "tower_arcane_arcane", thirdElement: "ice", resultTowerId: "tower_arcane_arcane_ice" },
  {
    parentFusionTowerId: "tower_arcane_arcane",
    thirdElement: "lightning",
    resultTowerId: "tower_arcane_arcane_lightning",
  },
  {
    parentFusionTowerId: "tower_arcane_arcane",
    thirdElement: "nature",
    resultTowerId: "tower_arcane_arcane_nature",
  },
  { parentFusionTowerId: "tower_arcane_arcane", thirdElement: "earth", resultTowerId: "tower_arcane_arcane_earth" },
  {
    parentFusionTowerId: "tower_arcane_arcane",
    thirdElement: "shadow",
    resultTowerId: "tower_arcane_arcane_shadow",
  },

  // Duplicate-parent completion, batch 4 (FINAL) — every remaining
  // shadow+shadow+Y (shadow+shadow+fire was already done). This completes
  // the full 42/42 duplicate-parent set, and with it every fusion
  // combination in the game — base pairs, duplicate pairs, distinct
  // triads, and duplicate-parent triads — now resolves to a real tower.
  { parentFusionTowerId: "tower_shadow_shadow", thirdElement: "ice", resultTowerId: "tower_shadow_shadow_ice" },
  {
    parentFusionTowerId: "tower_shadow_shadow",
    thirdElement: "lightning",
    resultTowerId: "tower_shadow_shadow_lightning",
  },
  {
    parentFusionTowerId: "tower_shadow_shadow",
    thirdElement: "nature",
    resultTowerId: "tower_shadow_shadow_nature",
  },
  { parentFusionTowerId: "tower_shadow_shadow", thirdElement: "earth", resultTowerId: "tower_shadow_shadow_earth" },
  {
    parentFusionTowerId: "tower_shadow_shadow",
    thirdElement: "arcane",
    resultTowerId: "tower_shadow_shadow_arcane",
  },

  // Triple-same-element completion (XXX) — a Twin/duplicate parent merged
  // with a THIRD copy of the same element again, rather than a distinct
  // third element. This category was missed in the original "full
  // completion" pass: Game.ts's eligibility check rejected any third
  // element matching either of the parent's two elements, which is correct
  // for a distinct-pair parent (Steamcaller + fire makes no sense) but was
  // also wrongly blocking a duplicate parent from taking one more of its
  // own element (Twin Ember + fire *does* make sense — a pure, maximally
  // specialized capstone). One per element, 7 total; completes every
  // fusion combination the game's 2-tier merge system can produce.
  { parentFusionTowerId: "tower_fire_fire", thirdElement: "fire", resultTowerId: "tower_fire_fire_fire" },
  { parentFusionTowerId: "tower_ice_ice", thirdElement: "ice", resultTowerId: "tower_ice_ice_ice" },
  {
    parentFusionTowerId: "tower_lightning_lightning",
    thirdElement: "lightning",
    resultTowerId: "tower_lightning_lightning_lightning",
  },
  {
    parentFusionTowerId: "tower_nature_nature",
    thirdElement: "nature",
    resultTowerId: "tower_nature_nature_nature",
  },
  { parentFusionTowerId: "tower_earth_earth", thirdElement: "earth", resultTowerId: "tower_earth_earth_earth" },
  {
    parentFusionTowerId: "tower_arcane_arcane",
    thirdElement: "arcane",
    resultTowerId: "tower_arcane_arcane_arcane",
  },
  {
    parentFusionTowerId: "tower_shadow_shadow",
    thirdElement: "shadow",
    resultTowerId: "tower_shadow_shadow_shadow",
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
