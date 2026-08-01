// Enemy roster for Runeward.
//
// Damage-multiplier convention used throughout `resistances` / `weaknesses`
// (both are `Partial<Record<Element, number>>` per src/game/types.ts):
//   - `resistances[el]` is a multiplier < 1 applied to incoming damage of
//     that element, e.g. 0.5 means the enemy takes HALF damage from `el`.
//   - `weaknesses[el]` is a multiplier > 1 applied to incoming damage of
//     that element, e.g. 1.6 means the enemy takes 60% MORE damage from `el`.
//   - An element absent from both takes 1.0x (neutral) damage.
// This keeps the combat math a single lookup: `resistances[el] ?? weaknesses[el] ?? 1`.
//
// `armor` is a flat mitigation stat layered on top of the elemental
// multiplier (interpreted by the future combat resolver in Game.ts) and is
// independent of `Element` — it represents the creature's physical hide/
// carapace toughness rather than an elemental property.
//
// `baseSpeed` is in world units/second. The grid cell size in Map01 is 2,
// so a speed of 2.0 covers one cell per second at a leisurely walk.

import type { EnemyDef } from "@/game/types";

export const ENEMY_REGISTRY: EnemyDef[] = [
  // ---------------------------------------------------------------------
  // Regular roster
  // ---------------------------------------------------------------------
  {
    id: "thornling",
    name: "Thornling",
    baseHealth: 42,
    baseSpeed: 3.1,
    armor: 2,
    movement: "ground",
    resistances: { nature: 0.5, earth: 0.8 },
    weaknesses: { fire: 1.6 },
    bounty: 6,
    modelId: "thornling",
  },
  {
    id: "cragback",
    name: "Cragback",
    baseHealth: 260,
    baseSpeed: 1.3,
    armor: 14,
    movement: "ground",
    resistances: { earth: 0.45 },
    weaknesses: { lightning: 1.5, nature: 1.15 },
    bounty: 18,
    modelId: "cragback",
  },
  {
    id: "skitterwing",
    name: "Skitterwing",
    baseHealth: 55,
    baseSpeed: 4.2,
    armor: 0,
    movement: "flying",
    resistances: { arcane: 0.55, lightning: 0.85 },
    weaknesses: { ice: 1.55 },
    bounty: 9,
    modelId: "skitterwing",
  },
  {
    id: "voltling",
    name: "Voltling",
    baseHealth: 18,
    baseSpeed: 5.4,
    armor: 0,
    movement: "ground",
    resistances: { lightning: 0.4 },
    weaknesses: { earth: 1.5, ice: 1.15 },
    bounty: 4,
    modelId: "voltling",
  },
  {
    id: "frostfang",
    name: "Frostfang",
    baseHealth: 95,
    baseSpeed: 3.0,
    armor: 6,
    movement: "ground",
    resistances: { ice: 0.5, arcane: 0.85 },
    weaknesses: { fire: 1.6 },
    bounty: 11,
    modelId: "frostfang",
  },
  {
    id: "cinderling",
    name: "Cinderling",
    baseHealth: 80,
    baseSpeed: 3.6,
    armor: 3,
    movement: "ground",
    resistances: { fire: 0.4, earth: 0.9 },
    weaknesses: { ice: 1.6, nature: 1.2 },
    bounty: 10,
    modelId: "cinderling",
  },
  {
    id: "quagbrute",
    name: "Quagbrute",
    baseHealth: 420,
    baseSpeed: 0.95,
    armor: 10,
    movement: "ground",
    resistances: { nature: 0.55, earth: 0.7, ice: 0.85 },
    weaknesses: { fire: 1.65 },
    bounty: 22,
    modelId: "quagbrute",
  },
  {
    id: "sandveil",
    name: "Sandveil Burrower",
    baseHealth: 70,
    baseSpeed: 3.4,
    armor: 5,
    movement: "burrowing",
    resistances: { earth: 0.5 },
    weaknesses: { ice: 1.4, lightning: 1.2 },
    bounty: 13,
    modelId: "sandveil",
  },

  // ---------------------------------------------------------------------
  // Wave 21+ additions
  // ---------------------------------------------------------------------
  // Gap filled: every existing flyer (skitterwing) is a fast glass cannon,
  // so anti-air investment tops out as "a little splash/DPS is enough."
  // Wraithguard is the roster's first *armored, tanky* flyer — slow for a
  // flyer but with cragback-tier health and the highest armor of any
  // non-boss enemy, forcing players who leaned on light anti-air to
  // actually commit sustained damage into the sky lane. Its
  // resistance/weakness spread deliberately inverts skitterwing's (which
  // resists arcane/lightning and fears ice) so the two flyers create real
  // targeting tension instead of reading as reskins of each other.
  {
    id: "wraithguard",
    name: "Wraithguard Sentinel",
    baseHealth: 300,
    baseSpeed: 1.9,
    armor: 13,
    movement: "flying",
    resistances: { arcane: 0.45, ice: 0.75 },
    weaknesses: { lightning: 1.55, nature: 1.2 },
    bounty: 24,
    modelId: "wraithguard",
  },
  // Gap filled: quagbrute is the roster's only "resist several elements"
  // puzzle unit, but it still has an obvious, single hard counter (fire
  // 1.65x) and modest armor (10). Runeshell Warden pushes that archetype
  // further into genuine late-game puzzle territory: FOUR resisted
  // elements (fire/earth/nature/ice) and the roster's highest armor, with
  // damage only really landing through arcane or lightning. It reads as a
  // ward-inscribed golem rather than a beast, giving the back half of the
  // campaign an enemy that punishes a mono-element defense outright.
  {
    id: "runeshell",
    name: "Runeshell Warden",
    baseHealth: 260,
    baseSpeed: 1.6,
    armor: 16,
    movement: "ground",
    resistances: { fire: 0.6, earth: 0.6, nature: 0.7, ice: 0.8 },
    weaknesses: { arcane: 1.7, lightning: 1.3 },
    bounty: 22,
    modelId: "runeshell",
  },

  // Gap filled: every other enemy's counter-play is purely elemental
  // (bring the right damage type) or armor (bring more damage). Nothing in
  // the roster tests whether a player leans on chill/root/curse-stacking
  // *instead* of raw DPS towers — a valid, encouraged playstyle given how
  // much of the tower roster's identity is status effects. Wardbound
  // Bulwark is the counter-play to that: a ground brute that resists 60%
  // of incoming status magnitude AND duration (see `statusResistance` in
  // types.ts), so a deck built entirely around CC-lock towers suddenly
  // needs real burst/DPS towers to back it up. It's not immune — chip
  // damage from DoTs and slows still land, just far weaker — so the
  // counter-play is "bring more raw damage", not "status towers are now
  // useless here".
  {
    id: "wardbound",
    name: "Wardbound Bulwark",
    baseHealth: 340,
    baseSpeed: 1.75,
    armor: 12,
    movement: "ground",
    resistances: { arcane: 0.5 },
    weaknesses: { earth: 1.5, fire: 1.3 },
    bounty: 26,
    modelId: "wardbound",
    statusResistance: 0.6,
  },

  // ---------------------------------------------------------------------
  // Bosses
  // ---------------------------------------------------------------------
  {
    id: "cindercolossus",
    name: "Emberback, the Molten Colossus",
    baseHealth: 5200,
    baseSpeed: 1.15,
    armor: 20,
    movement: "ground",
    resistances: { fire: 0.3, earth: 0.75 },
    weaknesses: { ice: 1.7, arcane: 1.15 },
    bounty: 260,
    modelId: "cindercolossus",
    isBoss: true,
  },
  {
    id: "hollowglacier",
    name: "The Hollow Glacier",
    baseHealth: 4600,
    baseSpeed: 1.65,
    armor: 10,
    movement: "flying",
    resistances: { ice: 0.3, arcane: 0.7 },
    weaknesses: { fire: 1.7, lightning: 1.2 },
    bounty: 240,
    modelId: "hollowglacier",
    isBoss: true,
  },
  // Wave 40 campaign finale. Emberback (fire, weak to ice/arcane) and The
  // Hollow Glacier (ice, weak to fire/lightning) already cover two thirds
  // of the wheel; Thal'vor is the arcane+storm force behind both, so it
  // fittingly *resists* the arcane/lightning damage that shredded the
  // midgame boss and the previous finale, and is only brought down by the
  // "grounding" elements (earth/nature) — a genuinely different answer
  // than either prior boss demanded, so a deck tuned for waves 10/20 alone
  // cannot coast through 40. Highest health/armor/bounty in the game by a
  // wide margin, per the capstone brief.
  {
    id: "stormsovereign",
    name: "Thal'vor, the Stormbound Sovereign",
    baseHealth: 9500,
    baseSpeed: 1.35,
    armor: 24,
    movement: "flying",
    resistances: { arcane: 0.35, lightning: 0.4 },
    weaknesses: { earth: 1.6, nature: 1.3 },
    bounty: 420,
    modelId: "stormsovereign",
    isBoss: true,
  },
];

export const ENEMY_BY_ID: Map<string, EnemyDef> = new Map(
  ENEMY_REGISTRY.map((e) => [e.id, e]),
);

export function getEnemyDef(id: string): EnemyDef {
  const def = ENEMY_BY_ID.get(id);
  if (!def) throw new Error(`Unknown enemy id: ${id}`);
  return def;
}
