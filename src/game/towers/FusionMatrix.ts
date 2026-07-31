import type { Element, FusionRecipe } from "@/game/types";
import { ELEMENTS } from "@/game/types";

/**
 * One recipe per unordered pair of the 6 elements (C(6,2) = 15), mapping to
 * the fusion TowerDef.id in TowerRegistry.ts. Pair enumeration order follows
 * ELEMENTS so it's stable and matches the id/model naming convention
 * (`tower_<a>_<b>` with a before b in ELEMENTS order).
 */
export const FUSION_RECIPES: FusionRecipe[] = [];

for (let i = 0; i < ELEMENTS.length; i++) {
  for (let j = i + 1; j < ELEMENTS.length; j++) {
    const a = ELEMENTS[i];
    const b = ELEMENTS[j];
    FUSION_RECIPES.push({
      inputs: [a, b],
      resultTowerId: `tower_${a}_${b}`,
    });
  }
}

const RECIPE_LOOKUP = new Map<string, FusionRecipe>(
  FUSION_RECIPES.map((r) => [fusionKey(r.inputs[0] as Element, r.inputs[1] as Element), r]),
);

function fusionKey(a: Element, b: Element): string {
  const [x, y] = ELEMENTS.indexOf(a) <= ELEMENTS.indexOf(b) ? [a, b] : [b, a];
  return `${x}+${y}`;
}

/** Look up the fusion recipe for two elements regardless of argument order. Returns undefined for same-element pairs (no recipe). */
export function getFusionRecipe(a: Element, b: Element): FusionRecipe | undefined {
  if (a === b) return undefined;
  return RECIPE_LOOKUP.get(fusionKey(a, b));
}

/** Resolve the resulting fusion tower id for two elements, or undefined if there is no such recipe. */
export function getFusionTowerId(a: Element, b: Element): string | undefined {
  return getFusionRecipe(a, b)?.resultTowerId;
}
