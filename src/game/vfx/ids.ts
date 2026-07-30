// vfx-id string convention, shared by ProjectileVfx, ImpactVfx, and
// VfxManager. TowerDef.projectileVfx / TowerDef.impactVfx / TowerDef.idleVfx
// (see game/types.ts) should be built with these helpers so the id strings
// stay consistent everywhere:
//
//   projectileVfxId("fire")        -> "vfx.fire.projectile"
//   impactVfxId("fire")            -> "vfx.fire.impact"
//   idleVfxId("fire")              -> "vfx.fire.idle"
//   fusionVfxId("fire", "nature")  -> "vfx.fusion.fire+nature"
//
// Tower abilities (see game/towers/TowerRegistry.ts's `makeAbility` helper)
// use a fourth shape that isn't built by a helper here since each ability
// hand-picks its own id: `vfx.<element-or-pair>.ability_<name>`, e.g.
// `"vfx.fire.ability_ignite"` or `"vfx.fire_ice.ability_scald"` (fusion
// abilities join their two parent elements with an underscore, not a `+`,
// to stay a valid single path segment). `parseVfxId` recognizes any id whose
// second segment is `ability_<...>` as `{kind: "ability"}` regardless of the
// category token, and leaves the full id intact for the consumer (AbilityVfx)
// to switch on directly — the 21 abilities are bespoke enough that
// re-deriving element(s) from the category token buys nothing.
//
// `TowerAbilityContext.emitVfx(vfxId, worldPos)` (game/types.ts) is the
// single entry point abilities use to trigger any of these — pass one of
// the ids above and a world position; VfxManager.emitVfx has the matching
// signature and dispatches based on the id shape.
import type { Element } from "@/game/types";

export function projectileVfxId(element: Element): string {
  return `vfx.${element}.projectile`;
}

export function impactVfxId(element: Element): string {
  return `vfx.${element}.impact`;
}

export function idleVfxId(element: Element): string {
  return `vfx.${element}.idle`;
}

export function fusionVfxId(a: Element, b: Element): string {
  return `vfx.fusion.${a}+${b}`;
}

export type ParsedVfxId =
  | { kind: "projectile"; element: Element }
  | { kind: "impact"; element: Element }
  | { kind: "idle"; element: Element }
  | { kind: "fusion"; elements: [Element, Element] }
  | { kind: "ability"; id: string }
  | { kind: "unknown" };

const ELEMENT_SET = new Set<string>(["fire", "ice", "lightning", "nature", "earth", "arcane"]);

function isElement(s: string): s is Element {
  return ELEMENT_SET.has(s);
}

/** Parses any id produced by the helpers above back into its parts. Used by
 * VfxManager to route a bare vfxId string to the right effect. */
export function parseVfxId(id: string): ParsedVfxId {
  const parts = id.split(".");
  if (parts[0] !== "vfx" || parts.length < 3) return { kind: "unknown" };
  const [, category, rest] = parts;
  if (category === "fusion") {
    const [a, b] = rest.split("+");
    if (isElement(a) && isElement(b)) return { kind: "fusion", elements: [a, b] };
    return { kind: "unknown" };
  }
  if (rest.startsWith("ability_")) return { kind: "ability", id };
  if (!isElement(category)) return { kind: "unknown" };
  if (rest === "projectile") return { kind: "projectile", element: category };
  if (rest === "impact") return { kind: "impact", element: category };
  if (rest === "idle") return { kind: "idle", element: category };
  return { kind: "unknown" };
}
