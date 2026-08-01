// Shared contracts for the whole game. Subsystems (towers, enemies, vfx, ui)
// are built against these types so they can be developed independently.

export type Element = "fire" | "ice" | "lightning" | "nature" | "earth" | "arcane" | "shadow";

export const ELEMENTS: Element[] = ["fire", "ice", "lightning", "nature", "earth", "arcane", "shadow"];

export interface GridCoord {
  x: number;
  z: number;
}

export type CellKind = "buildable" | "path" | "blocked" | "spawn" | "base";

export interface DamageInstance {
  amount: number;
  element: Element | "physical";
  source: string;
}

export type StatusEffectKind =
  | "burn"
  | "chill"
  | "freeze"
  | "shock"
  | "root"
  | "poison"
  | "sunder"
  | "silence"
  | "curse";

export interface StatusEffect {
  kind: StatusEffectKind;
  magnitude: number;
  durationMs: number;
  appliedAt: number;
  sourceTowerId: string;
}

export interface TowerStats {
  damage: number;
  range: number;
  fireRateMs: number;
  splashRadius?: number;
  projectileSpeed: number;
  critChance?: number;
  critMultiplier?: number;
}

export interface TowerTierDef {
  tier: 1 | 2 | 3;
  stats: TowerStats;
  cost: number;
  modelScale: number;
  description: string;
}

export interface TowerAbility {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
  onTrigger: (ctx: TowerAbilityContext) => void;
  /**
   * Minimum tower tier at which this ability is active/triggerable.
   * Omitted (undefined) means "available from tier 1" — every ability that
   * existed before this field was introduced has no `minTier`, so this is
   * fully backward compatible and changes no existing behavior.
   *
   * This is the tier-gating convention for `TowerDef.abilities`: a tower can
   * list more than one ability (the array already supported that), and an
   * ability with e.g. `minTier: 3` is a capstone that should only be
   * triggerable once the tower has been upgraded to that tier. The combat
   * orchestrator (Game.ts) is responsible for checking
   * `tower.currentTier >= (ability.minTier ?? 1)` before calling
   * `ability.onTrigger` — abilities below the tower's current tier must
   * simply not fire (and, in UI, should probably render as locked/greyed).
   * See src/game/towers/TowerRegistry.ts's file-header comment and the six
   * base towers' second `abilities[]` entry for the reference usage.
   */
  minTier?: 1 | 2 | 3;
}

export interface TowerAbilityContext {
  towerId: string;
  position: GridCoord;
  /** The tower's actual world-space position (post `Grid.gridToWorld`),
   * for abilities that need to emit VFX at the tower itself — `position`
   * above is grid-cell indices, not world units, and using it directly as
   * a world coordinate was a bug (see makeAbility in TowerRegistry.ts). */
  worldPosition: [number, number, number];
  applyStatus: (targetEnemyId: string, effect: StatusEffect) => void;
  dealDamage: (targetEnemyId: string, dmg: DamageInstance) => void;
  /** `statusKind`, when the ability applies one, lets the VFX layer draw a
   * bespoke effect matching what the ability actually does (a burn ability
   * throws embers, a freeze ability shatters ice, ...) instead of a generic
   * colored burst for every ability regardless of function. */
  emitVfx: (vfxId: string, worldPos: [number, number, number], statusKind?: StatusEffectKind) => void;
}

export interface TowerDef {
  id: string;
  name: string;
  element: Element | FusionElementPair;
  isFusion: boolean;
  flavorText: string;
  tiers: [TowerTierDef, TowerTierDef, TowerTierDef];
  abilities: TowerAbility[];
  targeting: "first" | "last" | "strongest" | "weakest" | "closest";
  projectileVfx: string;
  impactVfx: string;
  idleVfx?: string;
  modelId: string;
}

export type FusionElementPair = `${Element}+${Element}`;

export interface FusionRecipe {
  inputs: [Element, Element] | [string, string];
  resultTowerId: string;
}

export type EnemyMovementKind = "ground" | "flying" | "burrowing";

export interface EnemyDef {
  id: string;
  name: string;
  baseHealth: number;
  baseSpeed: number;
  armor: number;
  movement: EnemyMovementKind;
  resistances: Partial<Record<Element, number>>;
  weaknesses: Partial<Record<Element, number>>;
  bounty: number;
  modelId: string;
  isBoss?: boolean;
}

export interface WaveSpawnEntry {
  enemyId: string;
  count: number;
  intervalMs: number;
  healthMultiplier?: number;
}

export interface WaveDef {
  index: number;
  spawns: WaveSpawnEntry[];
  bossId?: string;
}

export interface PlayerId {
  id: "p1" | "p2";
}

export interface GameConfig {
  startingGold: number;
  startingLives: number;
  mapId: string;
}
