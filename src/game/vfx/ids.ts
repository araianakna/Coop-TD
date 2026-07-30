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
  if (!isElement(category)) return { kind: "unknown" };
  if (rest === "projectile") return { kind: "projectile", element: category };
  if (rest === "impact") return { kind: "impact", element: category };
  if (rest === "idle") return { kind: "idle", element: category };
  return { kind: "unknown" };
}
