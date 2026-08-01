import type { Element, FusionRecipe } from "@/game/types";
import { ELEMENTS } from "@/game/types";

/**
 * "Twin" fusions — pairing two IDENTICAL base towers (fire + fire, ice + ice,
 * ...) rather than two different ones. Kept in its own table instead of
 * folded into FusionMatrix.ts's FUSION_RECIPES, whose lookup explicitly
 * rejects `a === b` (see `getFusionRecipe`) — the two tables answer
 * different questions: FusionMatrix answers "which 2 DIFFERENT elements
 * fuse", this file answers "what do you get from doubling up on one
 * element". One recipe per element (7, including Shadow).
 */
export const DUPLICATE_FUSION_RECIPES: FusionRecipe[] = ELEMENTS.map((el) => ({
  inputs: [el, el],
  resultTowerId: `tower_${el}_${el}`,
}));

const DUPLICATE_LOOKUP = new Map<Element, FusionRecipe>(
  DUPLICATE_FUSION_RECIPES.map((r) => [r.inputs[0] as Element, r]),
);

/** Look up the Twin-fusion recipe for doubling up on one element. */
export function getDuplicateFusionRecipe(el: Element): FusionRecipe | undefined {
  return DUPLICATE_LOOKUP.get(el);
}
