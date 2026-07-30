// Shared contracts for the whole game. Subsystems (towers, enemies, vfx, ui)
// are built against these types so they can be developed independently.

export type Element = "fire" | "ice" | "lightning" | "nature" | "earth" | "arcane";

export const ELEMENTS: Element[] = ["fire", "ice", "lightning", "nature", "earth", "arcane"];

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
  | "silence";

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
}

export interface TowerAbilityContext {
  towerId: string;
  position: GridCoord;
  applyStatus: (targetEnemyId: string, effect: StatusEffect) => void;
  dealDamage: (targetEnemyId: string, dmg: DamageInstance) => void;
  emitVfx: (vfxId: string, worldPos: [number, number, number]) => void;
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
