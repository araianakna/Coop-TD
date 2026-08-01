import type {
  Element,
  StatusEffect,
  StatusEffectKind,
  TowerAbility,
  TowerAbilityContext,
  TowerDef,
  TowerStats,
  TowerTierDef,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Tier-3 capstone ability convention
// ---------------------------------------------------------------------------
//
// `TowerDef.abilities` is (and always was) `TowerAbility[]` — nothing here
// required a schema change to let a tower carry more than one ability.
// What towers needed was a way to say "this second ability only turns on
// once the tower is fully upgraded". That's the additive `minTier?: 1|2|3`
// field on `TowerAbility` (see game/types.ts) — omitted/undefined means
// "active from tier 1", so every ability that existed before this pass
// (all 21 of them) is completely unaffected.
//
// The six base elemental towers below each now carry a SECOND ability with
// `minTier: 3` — a capstone power, distinct in feel (different
// `statusKind`, heavier `bonusDamage`, much longer `cooldownMs`) from their
// tier-1 ability, not just a bigger version of it. The orchestrator wiring
// ability triggering into Game.ts must gate on this field directly:
//
//   for (const ability of towerDef.abilities) {
//     if (tower.currentTier >= (ability.minTier ?? 1)) { /* eligible to fire */ }
//   }
//
// A field was chosen over an id-suffix convention (e.g. `_t3`) because it's
// type-checked, self-documenting at the call site, and doesn't require the
// orchestrator to string-parse ability ids to find the gate.
//
// ---------------------------------------------------------------------------
// Tier-building helpers
// ---------------------------------------------------------------------------

interface TierSeed extends TowerStats {}

interface GrowthCurve {
  damage: number; // per-tier multiplier
  range: number;
  fireRate: number; // multiplier < 1 makes it fire faster at higher tiers
  splash: number;
}

const DEFAULT_GROWTH: GrowthCurve = { damage: 1.55, range: 1.1, fireRate: 0.85, splash: 1.18 };

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Builds the [tier1, tier2, tier3] tuple TowerDef.tiers requires from a single base seed. */
function buildTiers(
  seed: TierSeed,
  costs: [number, number, number],
  modelScales: [number, number, number],
  descriptions: [string, string, string],
  growth: GrowthCurve = DEFAULT_GROWTH,
): [TowerTierDef, TowerTierDef, TowerTierDef] {
  const tiers = [1, 2, 3].map((tierNum) => {
    const i = tierNum - 1;
    const dMult = growth.damage ** i;
    const rMult = growth.range ** i;
    const fMult = growth.fireRate ** i;
    const sMult = growth.splash ** i;
    const stats: TowerStats = {
      damage: round(seed.damage * dMult),
      range: round(seed.range * rMult, 1),
      fireRateMs: round(seed.fireRateMs * fMult),
      projectileSpeed: seed.projectileSpeed,
      splashRadius: seed.splashRadius !== undefined ? round(seed.splashRadius * sMult, 2) : undefined,
      critChance: seed.critChance,
      critMultiplier: seed.critMultiplier,
    };
    const tier: TowerTierDef = {
      tier: tierNum as 1 | 2 | 3,
      stats,
      cost: costs[i],
      modelScale: modelScales[i],
      description: descriptions[i],
    };
    return tier;
  });
  return tiers as [TowerTierDef, TowerTierDef, TowerTierDef];
}

// ---------------------------------------------------------------------------
// Ability helper
// ---------------------------------------------------------------------------

/**
 * Builds a real, callable TowerAbility. Combat wiring (targeting/AoE
 * resolution) lands in a later pass, so `onTrigger` here always emits the
 * ability's VFX at the tower's position and then demonstrates the
 * damage/status call shape against a placeholder target id — harmless until
 * the combat system starts calling `onTrigger` with a live context, at which
 * point it supplies real enemy ids instead of resolving them itself.
 */
function makeAbility(opts: {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
  vfxId: string;
  statusKind?: StatusEffectKind;
  statusMagnitude?: number;
  statusDurationMs?: number;
  bonusDamage?: number;
  damageElement?: Element | "physical";
  /** See "Tier-3 capstone ability convention" above. Omit for a tier-1-available ability. */
  minTier?: 1 | 2 | 3;
}): TowerAbility {
  const {
    id,
    name,
    description,
    cooldownMs,
    vfxId,
    statusKind,
    statusMagnitude = 0,
    statusDurationMs = 0,
    bonusDamage,
    damageElement,
    minTier,
  } = opts;

  return {
    id,
    name,
    description,
    cooldownMs,
    minTier,
    onTrigger: (ctx: TowerAbilityContext) => {
      ctx.emitVfx(vfxId, ctx.worldPosition, statusKind);

      // Stub target id — replaced by the real enemy id(s) the combat system
      // resolves once ability triggering is wired into Game.ts.
      const stubTargetId = `${ctx.towerId}:ability-target`;

      if (statusKind) {
        const effect: StatusEffect = {
          kind: statusKind,
          magnitude: statusMagnitude,
          durationMs: statusDurationMs,
          appliedAt: Date.now(),
          sourceTowerId: ctx.towerId,
        };
        ctx.applyStatus(stubTargetId, effect);
      }
      if (bonusDamage !== undefined) {
        ctx.dealDamage(stubTargetId, {
          amount: bonusDamage,
          element: damageElement ?? "physical",
          source: ctx.towerId,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Base elemental towers
// ---------------------------------------------------------------------------

const fireTower: TowerDef = {
  id: "tower_fire",
  name: "Ember Spire",
  element: "fire",
  isFusion: false,
  flavorText: "A charred obsidian pillar that never stops burning.",
  tiers: buildTiers(
    { damage: 18, range: 5.4, fireRateMs: 850, projectileSpeed: 14, splashRadius: 1.1 },
    [70, 190, 460],
    [1, 1.25, 1.55],
    [
      "A single guttering flame licks atop a rough-hewn rock pillar.",
      "The flame has grown into a roaring bonfire wreathed in drifting embers.",
      "A pillar of true fire — the surrounding rock has half-melted to slag.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "ember_spire_ignite",
      name: "Ignite",
      description: "Sets the current target ablaze, dealing burn damage over time.",
      cooldownMs: 6000,
      vfxId: "vfx.fire.ability_ignite",
      statusKind: "burn",
      statusMagnitude: 6,
      statusDurationMs: 4000,
    }),
    makeAbility({
      id: "ember_spire_meteor_strike",
      name: "Meteor Strike",
      description:
        "Tier-3 capstone. Calls down a molten meteor that shatters the target's armor and detonates for massive fire damage.",
      cooldownMs: 15000,
      vfxId: "vfx.fire.ability_meteor_strike",
      statusKind: "sunder",
      statusMagnitude: 0.4,
      statusDurationMs: 5000,
      bonusDamage: 55,
      damageElement: "fire",
      minTier: 3,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire.projectile",
  impactVfx: "vfx.fire.impact",
  idleVfx: "vfx.fire.idle",
  modelId: "tower_fire",
};

const iceTower: TowerDef = {
  id: "tower_ice",
  name: "Frost Pillar",
  element: "ice",
  isFusion: false,
  flavorText: "Cold radiates outward in visible ripples of frozen air.",
  tiers: buildTiers(
    { damage: 9, range: 6.4, fireRateMs: 1000, projectileSpeed: 12 },
    [70, 190, 460],
    [1, 1.25, 1.55],
    [
      "A hexagonal slab of packed ice with a single crystal spire.",
      "Frost has spread across the ground; the spire has grown a fan of shards.",
      "A glacial monument radiating a visible chill haze.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frost_pillar_chill",
      name: "Deep Chill",
      description: "Chills the target, slowing its movement; can stack toward a full freeze.",
      cooldownMs: 5000,
      vfxId: "vfx.ice.ability_chill",
      statusKind: "chill",
      statusMagnitude: 0.35,
      statusDurationMs: 3000,
    }),
    makeAbility({
      id: "frost_pillar_absolute_zero",
      name: "Absolute Zero",
      description:
        "Tier-3 capstone. Flash-freezes the target solid in an expanding sphere of absolute cold, locking it far longer than a simple chill.",
      cooldownMs: 16000,
      vfxId: "vfx.ice.ability_absolute_zero",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 3200,
      bonusDamage: 25,
      damageElement: "ice",
      minTier: 3,
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.ice.projectile",
  impactVfx: "vfx.ice.impact",
  idleVfx: "vfx.ice.idle",
  modelId: "tower_ice",
};

const lightningTower: TowerDef = {
  id: "tower_lightning",
  name: "Storm Conduit",
  element: "lightning",
  isFusion: false,
  flavorText: "A coil-wound mast that hums audibly before every shot.",
  tiers: buildTiers(
    { damage: 7, range: 5.0, fireRateMs: 420, projectileSpeed: 22 },
    [80, 210, 500],
    [1, 1.2, 1.45],
    [
      "A slim metal mast crackles with a single tethered spark.",
      "Coiled windings now wrap the mast, crackling orb grown restless.",
      "A tesla tower proper — arcs leap constantly between its spikes.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "storm_conduit_overcharge",
      name: "Overcharge",
      description: "Briefly shocks the target, stunning-adjacent systems and disrupting regen.",
      cooldownMs: 4500,
      vfxId: "vfx.lightning.ability_overcharge",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 1500,
    }),
    makeAbility({
      id: "storm_conduit_grand_overload",
      name: "Grand Overload",
      description:
        "Tier-3 capstone. Floods the target with raw current, frying its systems and silencing every special capability for several seconds.",
      cooldownMs: 14000,
      vfxId: "vfx.lightning.ability_grand_overload",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 4000,
      bonusDamage: 40,
      damageElement: "lightning",
      minTier: 3,
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.lightning.projectile",
  impactVfx: "vfx.lightning.impact",
  idleVfx: "vfx.lightning.idle",
  modelId: "tower_lightning",
};

const natureTower: TowerDef = {
  id: "tower_nature",
  name: "Thornroot Totem",
  element: "nature",
  isFusion: false,
  flavorText: "Roots pulse with slow green light, patient and relentless.",
  tiers: buildTiers(
    { damage: 6, range: 5.8, fireRateMs: 700, projectileSpeed: 10 },
    [65, 175, 420],
    [1, 1.3, 1.6],
    [
      "A young sapling wrapped in a single glowing vine.",
      "The trunk has thickened; thorned vines now wrap it twice over.",
      "A living totem, canopy wide, thorns long enough to gore armor.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "thornroot_toxin",
      name: "Toxin Bloom",
      description: "Coats the target in spores that poison it over time.",
      cooldownMs: 5500,
      vfxId: "vfx.nature.ability_toxin",
      statusKind: "poison",
      statusMagnitude: 4,
      statusDurationMs: 5000,
    }),
    makeAbility({
      id: "thornroot_verdant_wrath",
      name: "Verdant Wrath",
      description:
        "Tier-3 capstone. Erupts a cage of ironwood roots that binds the target in place while gouging thorns tear deep wounds.",
      cooldownMs: 15000,
      vfxId: "vfx.nature.ability_verdant_wrath",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 4000,
      bonusDamage: 35,
      damageElement: "nature",
      minTier: 3,
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.nature.projectile",
  impactVfx: "vfx.nature.impact",
  idleVfx: "vfx.nature.idle",
  modelId: "tower_nature",
};

const earthTower: TowerDef = {
  id: "tower_earth",
  name: "Stonewarden",
  element: "earth",
  isFusion: false,
  flavorText: "Slow, heavy, and utterly immovable.",
  tiers: buildTiers(
    { damage: 24, range: 4.2, fireRateMs: 1500, projectileSpeed: 9, splashRadius: 1.4 },
    [75, 200, 480],
    [1, 1.3, 1.65],
    [
      "A single glowing boulder balanced on a rough plinth.",
      "Two boulders now stack, cracks bright with buried heat.",
      "A towering cairn of stacked stone, each boulder deeply fissured.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stonewarden_sunder",
      name: "Sunder",
      description: "Cracks the target's armor, reducing its damage resistance.",
      cooldownMs: 7000,
      vfxId: "vfx.earth.ability_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.25,
      statusDurationMs: 4000,
    }),
    makeAbility({
      id: "stonewarden_cataclysm",
      name: "Cataclysm",
      description:
        "Tier-3 capstone. Slams down a crushing avalanche of stone, dealing a massive burst of damage with no defenses spared.",
      cooldownMs: 17000,
      vfxId: "vfx.earth.ability_cataclysm",
      bonusDamage: 70,
      damageElement: "physical",
      minTier: 3,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth.projectile",
  impactVfx: "vfx.earth.impact",
  idleVfx: "vfx.earth.idle",
  modelId: "tower_earth",
};

const arcaneTower: TowerDef = {
  id: "tower_arcane",
  name: "Rune Obelisk",
  element: "arcane",
  isFusion: false,
  flavorText: "Hovers a hand's-width off the ground, rune-plates drifting lazily around it.",
  tiers: buildTiers(
    { damage: 13, range: 6.2, fireRateMs: 950, projectileSpeed: 17, critChance: 0.22, critMultiplier: 2.1 },
    [85, 220, 520],
    [1, 1.25, 1.5],
    [
      "A short obelisk hovers just above its floating disc, one glyph orbiting it.",
      "The obelisk has grown taller; a second ring of glyphs now orbits it.",
      "A towering rune-covered monolith crowned by twin rotating glyph rings.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "rune_obelisk_silence",
      name: "Silence",
      description: "Suppresses the target's special abilities for a short time.",
      cooldownMs: 8000,
      vfxId: "vfx.arcane.ability_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2500,
    }),
    makeAbility({
      id: "rune_obelisk_reality_tear",
      name: "Reality Tear",
      description:
        "Tier-3 capstone. Tears a rift in reality beneath the target, shredding its defenses and unleashing raw arcane force.",
      cooldownMs: 15000,
      vfxId: "vfx.arcane.ability_reality_tear",
      statusKind: "sunder",
      statusMagnitude: 0.5,
      statusDurationMs: 5000,
      bonusDamage: 45,
      damageElement: "arcane",
      minTier: 3,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane.projectile",
  impactVfx: "vfx.arcane.impact",
  idleVfx: "vfx.arcane.idle",
  modelId: "tower_arcane",
};

const shadowTower: TowerDef = {
  id: "tower_shadow",
  name: "Wraith Pylon",
  element: "shadow",
  isFusion: false,
  flavorText: "A tattered cloak of living dark drifts around a cairn of cold stone, watching with one violet eye.",
  tiers: buildTiers(
    { damage: 11, range: 5.8, fireRateMs: 900, projectileSpeed: 16 },
    [80, 210, 500],
    [1, 1.25, 1.5],
    [
      "A single ragged wisp of shadow coils around the cairn, one faint eye half-open.",
      "The cloak has thickened into ragged folds; a second eye has opened within it.",
      "A towering shroud of living dark, three eyes watching every corner of its range at once.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wraith_pylon_curse",
      name: "Curse",
      description: "Brands the target with a curse, making all damage it takes hit harder for a time.",
      cooldownMs: 6500,
      vfxId: "vfx.shadow.ability_curse",
      statusKind: "curse",
      statusMagnitude: 0.3,
      statusDurationMs: 4000,
    }),
    makeAbility({
      id: "wraith_pylon_soul_rend",
      name: "Soul Rend",
      description:
        "Tier-3 capstone. Tears at the target's essence directly, dealing heavy shadow damage and deepening its curse.",
      cooldownMs: 15000,
      vfxId: "vfx.shadow.ability_soul_rend",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 5000,
      bonusDamage: 42,
      damageElement: "shadow",
      minTier: 3,
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.shadow.projectile",
  impactVfx: "vfx.shadow.impact",
  idleVfx: "vfx.shadow.idle",
  modelId: "tower_shadow",
};

// ---------------------------------------------------------------------------
// Fusion towers — one per unordered pair of the 6 elements (C(6,2) = 15)
// ---------------------------------------------------------------------------

const fireIceTower: TowerDef = {
  id: "tower_fire_ice",
  name: "Steamcaller",
  element: "fire+ice",
  isFusion: true,
  flavorText: "Superheated vapor screams from an ice-crystal vent, scalding anything close.",
  tiers: buildTiers(
    { damage: 26, range: 5.8, fireRateMs: 700, projectileSpeed: 15, splashRadius: 1.5 },
    [260, 560, 1150],
    [1, 1.22, 1.5],
    [
      "A crystal vent hisses out a thin jet of scalding steam.",
      "The vent has widened; steam now billows in visible rolling clouds.",
      "A geyser of superheated vapor howls continuously from the shattered ice crown.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "steamcaller_scald",
      name: "Scald",
      description: "Vents a burst of superheated steam, burning and briefly chilling everything caught in it.",
      cooldownMs: 7000,
      vfxId: "vfx.fire_ice.ability_scald",
      statusKind: "burn",
      statusMagnitude: 8,
      statusDurationMs: 3000,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_ice.projectile",
  impactVfx: "vfx.fire_ice.impact",
  idleVfx: "vfx.fire_ice.idle",
  modelId: "tower_fire_ice",
};

const fireLightningTower: TowerDef = {
  id: "tower_fire_lightning",
  name: "Plasma Arc",
  element: "fire+lightning",
  isFusion: true,
  flavorText: "A caged sphere of ionized flame, unstable and eager to discharge.",
  tiers: buildTiers(
    { damage: 22, range: 5.6, fireRateMs: 380, projectileSpeed: 24 },
    [270, 580, 1180],
    [1, 1.2, 1.48],
    [
      "A small plasma mote hovers inside a bare tesla cage.",
      "The mote has swollen into a crackling orb, spikes glowing hot.",
      "A miniature sun crackles inside a full cage of arcing spikes.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "plasma_arc_discharge",
      name: "Discharge",
      description: "Releases a chained arc of superheated plasma, burning and shocking the target.",
      cooldownMs: 5500,
      vfxId: "vfx.fire_lightning.ability_discharge",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 1800,
      bonusDamage: 14,
      damageElement: "fire",
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.fire_lightning.projectile",
  impactVfx: "vfx.fire_lightning.impact",
  idleVfx: "vfx.fire_lightning.idle",
  modelId: "tower_fire_lightning",
};

const fireNatureTower: TowerDef = {
  id: "tower_fire_nature",
  name: "Wildfire Warden",
  element: "fire+nature",
  isFusion: true,
  flavorText: "A living trunk that burns without ever being consumed.",
  tiers: buildTiers(
    { damage: 16, range: 5.6, fireRateMs: 620, projectileSpeed: 12, splashRadius: 1.0 },
    [250, 540, 1120],
    [1, 1.25, 1.55],
    [
      "A young burning tree, flames confined to a few licking vines.",
      "Flame has spread across the whole canopy, thorns glowing ember-red.",
      "A wildfire given living shape — every branch a torch, every thorn a coal.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wildfire_warden_spread",
      name: "Spreading Blaze",
      description: "Ignites the target and lets the burn jump to nearby enemies.",
      cooldownMs: 6500,
      vfxId: "vfx.fire_nature.ability_spread",
      statusKind: "burn",
      statusMagnitude: 7,
      statusDurationMs: 4500,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_nature.projectile",
  impactVfx: "vfx.fire_nature.impact",
  idleVfx: "vfx.fire_nature.idle",
  modelId: "tower_fire_nature",
};

const fireEarthTower: TowerDef = {
  id: "tower_fire_earth",
  name: "Magma Forge",
  element: "fire+earth",
  isFusion: true,
  flavorText: "A boulder totem with a molten heart, cracks glowing white-hot.",
  tiers: buildTiers(
    { damage: 32, range: 4.6, fireRateMs: 1350, projectileSpeed: 9, splashRadius: 1.8 },
    [270, 580, 1200],
    [1, 1.28, 1.6],
    [
      "A single boulder, its cracks weeping faint orange light.",
      "Two stacked boulders now, magma visibly pooling in the deeper cracks.",
      "A cairn of molten rock, glowing rivers running down every face.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "magma_forge_eruption",
      name: "Eruption",
      description: "Erupts molten rock beneath the target area, dealing heavy splash burn damage.",
      cooldownMs: 8500,
      vfxId: "vfx.fire_earth.ability_eruption",
      statusKind: "burn",
      statusMagnitude: 10,
      statusDurationMs: 4000,
      bonusDamage: 30,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_earth.projectile",
  impactVfx: "vfx.fire_earth.impact",
  idleVfx: "vfx.fire_earth.idle",
  modelId: "tower_fire_earth",
};

const fireArcaneTower: TowerDef = {
  id: "tower_fire_arcane",
  name: "Hellfire Sigil",
  element: "fire+arcane",
  isFusion: true,
  flavorText: "A blackened obelisk binding a captive flame behind burning glyphs.",
  tiers: buildTiers(
    { damage: 24, range: 6.0, fireRateMs: 800, projectileSpeed: 16, critChance: 0.28, critMultiplier: 2.3 },
    [280, 600, 1220],
    [1, 1.24, 1.5],
    [
      "A short obelisk, one ring of glyphs burning faint orange.",
      "The obelisk has grown; the flame core now roars visibly within.",
      "A towering black sigil, the captive flame lashing against two burning glyph rings.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hellfire_sigil_brand",
      name: "Hellbrand",
      description: "Brands the target with a burning sigil that silences its abilities while it burns.",
      cooldownMs: 7500,
      vfxId: "vfx.fire_arcane.ability_brand",
      statusKind: "burn",
      statusMagnitude: 9,
      statusDurationMs: 3500,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_arcane.projectile",
  impactVfx: "vfx.fire_arcane.impact",
  idleVfx: "vfx.fire_arcane.idle",
  modelId: "tower_fire_arcane",
};

const iceLightningTower: TowerDef = {
  id: "tower_ice_lightning",
  name: "Frostshock Pylon",
  element: "ice+lightning",
  isFusion: true,
  flavorText: "Lightning splits along hairline cracks in a shard of unmelting ice.",
  tiers: buildTiers(
    { damage: 14, range: 5.6, fireRateMs: 480, projectileSpeed: 20 },
    [265, 570, 1160],
    [1, 1.22, 1.5],
    [
      "A single ice shard with one faint crack of trapped lightning.",
      "A fan of shards now crackles, each cracked with a thin blue arc.",
      "A crystalline lightning rod — every facet alive with jagged light.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frostshock_shatterbolt",
      name: "Shatterbolt",
      description: "Freezes the target solid, then shocks it — brittle ice conducts the charge violently.",
      cooldownMs: 6000,
      vfxId: "vfx.ice_lightning.ability_shatterbolt",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 1200,
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.ice_lightning.projectile",
  impactVfx: "vfx.ice_lightning.impact",
  idleVfx: "vfx.ice_lightning.idle",
  modelId: "tower_ice_lightning",
};

const iceNatureTower: TowerDef = {
  id: "tower_ice_nature",
  name: "Permafrost Grove",
  element: "ice+nature",
  isFusion: true,
  flavorText: "A tree frozen mid-growth, icicles hanging from every living branch.",
  tiers: buildTiers(
    { damage: 11, range: 6.2, fireRateMs: 780, projectileSpeed: 11 },
    [255, 550, 1130],
    [1, 1.26, 1.56],
    [
      "A small frosted sapling, a thin shell of ice over its bark.",
      "The canopy has widened, icicles now hanging from every bough.",
      "A grove-tree fully encased in glittering permafrost, roots frozen deep.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "permafrost_grove_bind",
      name: "Rootfrost",
      description: "Roots the target in frozen vines, slowing and immobilizing it briefly.",
      cooldownMs: 6500,
      vfxId: "vfx.ice_nature.ability_bind",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 2200,
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_nature.projectile",
  impactVfx: "vfx.ice_nature.impact",
  idleVfx: "vfx.ice_nature.idle",
  modelId: "tower_ice_nature",
};

const iceEarthTower: TowerDef = {
  id: "tower_ice_earth",
  name: "Glacier Bastion",
  element: "ice+earth",
  isFusion: true,
  flavorText: "Interlocking slabs of rock and ancient ice, immense and unmoving.",
  tiers: buildTiers(
    { damage: 30, range: 4.4, fireRateMs: 1500, projectileSpeed: 8, splashRadius: 1.5 },
    [275, 590, 1210],
    [1, 1.3, 1.62],
    [
      "A low rampart of alternating rock and ice blocks.",
      "The rampart now rises in two full tiers, cracks glowing pale blue.",
      "A glacial bastion looming overhead, ice and stone fused into one mass.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "glacier_bastion_avalanche",
      name: "Avalanche",
      description: "Slams down a wall of ice and rock, sundering armor and chilling everything nearby.",
      cooldownMs: 9000,
      vfxId: "vfx.ice_earth.ability_avalanche",
      statusKind: "sunder",
      statusMagnitude: 0.3,
      statusDurationMs: 4000,
      bonusDamage: 22,
      damageElement: "ice",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_earth.projectile",
  impactVfx: "vfx.ice_earth.impact",
  idleVfx: "vfx.ice_earth.idle",
  modelId: "tower_ice_earth",
};

const iceArcaneTower: TowerDef = {
  id: "tower_ice_arcane",
  name: "Frostweave Loom",
  element: "ice+arcane",
  isFusion: true,
  flavorText: "A floating obelisk woven from interlaced threads of living ice and rune-light.",
  tiers: buildTiers(
    { damage: 15, range: 6.4, fireRateMs: 880, projectileSpeed: 18, critChance: 0.24, critMultiplier: 2.15 },
    [270, 585, 1190],
    [1, 1.25, 1.52],
    [
      "A slender obelisk of woven ice, a single glyph orbiting it.",
      "The weave has thickened; two glyph rings now drift around it.",
      "A towering loom of frozen light, glyph rings spinning in counter-motion.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frostweave_loom_bind",
      name: "Rune-Frost Bind",
      description: "Freezes the target and silences its abilities for the duration.",
      cooldownMs: 8000,
      vfxId: "vfx.ice_arcane.ability_bind",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 1600,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_arcane.projectile",
  impactVfx: "vfx.ice_arcane.impact",
  idleVfx: "vfx.ice_arcane.idle",
  modelId: "tower_ice_arcane",
};

const lightningNatureTower: TowerDef = {
  id: "tower_lightning_nature",
  name: "Thornstorm Totem",
  element: "lightning+nature",
  isFusion: true,
  flavorText: "Copper-wreathed thorns spark and arc between each other like a living storm cloud.",
  tiers: buildTiers(
    { damage: 10, range: 5.6, fireRateMs: 460, projectileSpeed: 19 },
    [260, 565, 1155],
    [1, 1.23, 1.5],
    [
      "A young totem with a single sparking thorn.",
      "The canopy of thorns has thickened, arcs jumping between several.",
      "A crown of live-wire thorns, sparking continuously across the whole totem.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "thornstorm_totem_lash",
      name: "Static Lash",
      description: "Roots the target with charged vines that periodically shock it.",
      cooldownMs: 6000,
      vfxId: "vfx.lightning_nature.ability_lash",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 2000,
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.lightning_nature.projectile",
  impactVfx: "vfx.lightning_nature.impact",
  idleVfx: "vfx.lightning_nature.idle",
  modelId: "tower_lightning_nature",
};

const lightningEarthTower: TowerDef = {
  id: "tower_lightning_earth",
  name: "Seismic Coil",
  element: "lightning+earth",
  isFusion: true,
  flavorText: "A charged coil wrapped around a fault-cracked pillar, humming before every tremor.",
  tiers: buildTiers(
    { damage: 20, range: 4.8, fireRateMs: 900, projectileSpeed: 13, splashRadius: 1.3 },
    [265, 575, 1170],
    [1, 1.27, 1.58],
    [
      "A short pillar, a single coil wound loosely around it.",
      "The coil has doubled, fault-lines glowing brighter with each pulse.",
      "A seismic conduit, coils dense and fault-lines arcing constantly.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "seismic_coil_quake",
      name: "Chain Quake",
      description: "Sends a charged tremor outward, shocking and sundering everything it passes through.",
      cooldownMs: 8000,
      vfxId: "vfx.lightning_earth.ability_quake",
      statusKind: "sunder",
      statusMagnitude: 0.28,
      statusDurationMs: 3500,
      bonusDamage: 18,
      damageElement: "lightning",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.lightning_earth.projectile",
  impactVfx: "vfx.lightning_earth.impact",
  idleVfx: "vfx.lightning_earth.idle",
  modelId: "tower_lightning_earth",
};

const lightningArcaneTower: TowerDef = {
  id: "tower_lightning_arcane",
  name: "Arcflux Spire",
  element: "lightning+arcane",
  isFusion: true,
  flavorText: "A sleek conduit spire, entirely charged, humming with barely-restrained current.",
  tiers: buildTiers(
    { damage: 17, range: 6.0, fireRateMs: 360, projectileSpeed: 25, critChance: 0.2, critMultiplier: 2.0 },
    [275, 595, 1195],
    [1, 1.22, 1.48],
    [
      "A slim spire ringed by a single spinning coil.",
      "Two coils now spin in counter-rotation, spire humming audibly.",
      "A conduit spire haloed by three coils, current visibly arcing off its tip.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "arcflux_spire_surge",
      name: "Surge",
      description: "Overloads the target with pure current, shocking it and silencing its abilities.",
      cooldownMs: 5000,
      vfxId: "vfx.lightning_arcane.ability_surge",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 2000,
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.lightning_arcane.projectile",
  impactVfx: "vfx.lightning_arcane.impact",
  idleVfx: "vfx.lightning_arcane.idle",
  modelId: "tower_lightning_arcane",
};

const natureEarthTower: TowerDef = {
  id: "tower_nature_earth",
  name: "Overgrowth Colossus",
  element: "nature+earth",
  isFusion: true,
  flavorText: "A boulder totem long since reclaimed by vine and moss, cracks glowing living green.",
  tiers: buildTiers(
    { damage: 21, range: 5.0, fireRateMs: 1100, projectileSpeed: 10, splashRadius: 1.4 },
    [258, 555, 1140],
    [1, 1.28, 1.6],
    [
      "A single moss-veined boulder, one vine curling up its side.",
      "Two boulders now, thickly wrapped in living vine and moss.",
      "A colossus of stone and root, thorned vines cascading from every crack.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "overgrowth_colossus_smother",
      name: "Smother",
      description: "Roots the target under crushing vines and poisons it while it struggles.",
      cooldownMs: 7000,
      vfxId: "vfx.nature_earth.ability_smother",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 2500,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_earth.projectile",
  impactVfx: "vfx.nature_earth.impact",
  idleVfx: "vfx.nature_earth.idle",
  modelId: "tower_nature_earth",
};

const natureArcaneTower: TowerDef = {
  id: "tower_nature_arcane",
  name: "Druidic Sanctum",
  element: "nature+arcane",
  isFusion: true,
  flavorText: "A living canopy encircled by slow-turning rings of rune-light.",
  tiers: buildTiers(
    { damage: 13, range: 6.4, fireRateMs: 680, projectileSpeed: 13, critChance: 0.18, critMultiplier: 2.0 },
    [262, 568, 1150],
    [1, 1.26, 1.55],
    [
      "A young tree, a single faint glyph orbiting its canopy.",
      "The canopy has widened; two glyph rings now drift around it.",
      "A druidic sanctuary tree, canopy vast, glyph rings spinning in slow counterpoint.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "druidic_sanctum_wither",
      name: "Wither",
      description: "Poisons the target and silences its abilities as the sanctum's magic saps its strength.",
      cooldownMs: 7500,
      vfxId: "vfx.nature_arcane.ability_wither",
      statusKind: "poison",
      statusMagnitude: 5,
      statusDurationMs: 4500,
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.nature_arcane.projectile",
  impactVfx: "vfx.nature_arcane.impact",
  idleVfx: "vfx.nature_arcane.idle",
  modelId: "tower_nature_arcane",
};

const earthArcaneTower: TowerDef = {
  id: "tower_earth_arcane",
  name: "Runeforge Monolith",
  element: "earth+arcane",
  isFusion: true,
  flavorText: "A floating stone slab carved with glowing forge-glyphs and studded rivets.",
  tiers: buildTiers(
    { damage: 27, range: 5.4, fireRateMs: 1050, projectileSpeed: 14, critChance: 0.2, critMultiplier: 2.1 },
    [278, 598, 1215],
    [1, 1.27, 1.58],
    [
      "A small stone slab, one glyph faintly lit at its center.",
      "The slab has grown; two glyphs now glow, rivets bright between them.",
      "A rune-forged monolith, glyphs blazing across a slab riveted with glowing metal.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "runeforge_monolith_brand",
      name: "Forge Brand",
      description: "Brands the target, sundering its armor and silencing its abilities at once.",
      cooldownMs: 8500,
      vfxId: "vfx.earth_arcane.ability_brand",
      statusKind: "sunder",
      statusMagnitude: 0.3,
      statusDurationMs: 4000,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_arcane.projectile",
  impactVfx: "vfx.earth_arcane.impact",
  idleVfx: "vfx.earth_arcane.idle",
  modelId: "tower_earth_arcane",
};

// ---------------------------------------------------------------------------
// Shadow cross-fusions — shadow paired with each of the original 6 elements,
// completing FusionMatrix.ts's now-C(7,2)=21-pair auto-generated recipe list
// (added alongside Shadow as the 7th base element). Every one shares a
// signature identity — Curse, the same status Wraith Pylon applies alone —
// plus a bonus-damage burst in the OTHER element, so each fusion reads as
// "shadow amplifies, then <element> follows through" rather than six
// interchangeable curse-bots.
// ---------------------------------------------------------------------------

const fireShadowTower: TowerDef = {
  id: "tower_fire_shadow",
  name: "Hexflame Sconce",
  element: "fire+shadow",
  isFusion: true,
  flavorText: "A brazier of black flame that burns cold to the eye and hot to the curse it carries.",
  tiers: buildTiers(
    { damage: 22, range: 5.6, fireRateMs: 780, projectileSpeed: 15 },
    [265, 570, 1165],
    [1, 1.24, 1.53],
    [
      "A small iron sconce holding a single guttering black flame.",
      "The flame has spread across the sconce's rim, hissing where it licks the metal.",
      "A brazier of true black fire, curse-light bleeding from every crack in the iron.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hexflame_sconce_blightfire",
      name: "Blightfire",
      description: "Brands the target with a curse, then detonates a burst of black fire on the wound.",
      cooldownMs: 7200,
      vfxId: "vfx.fire_shadow.ability_blightfire",
      statusKind: "curse",
      statusMagnitude: 0.28,
      statusDurationMs: 3800,
      bonusDamage: 22,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_shadow.projectile",
  impactVfx: "vfx.fire_shadow.impact",
  idleVfx: "vfx.fire_shadow.idle",
  modelId: "tower_fire_shadow",
};

const iceShadowTower: TowerDef = {
  id: "tower_ice_shadow",
  name: "Grieving Shard",
  element: "ice+shadow",
  isFusion: true,
  flavorText: "A crystal shard weeping violet frost, cold enough to make a curse linger.",
  tiers: buildTiers(
    { damage: 20, range: 5.9, fireRateMs: 820, projectileSpeed: 16 },
    [260, 559, 1144],
    [1, 1.24, 1.53],
    [
      "A pale shard, one violet crack running through its length.",
      "Frost has spread from the crack, weeping thin trails of shadow.",
      "A grieving crystal, entirely veined in violet frost that never stops seeping.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "grieving_shard_frostbrand",
      name: "Frostbrand",
      description: "Brands the target with a curse, then lances it with a shard of curse-cold ice.",
      cooldownMs: 7200,
      vfxId: "vfx.ice_shadow.ability_frostbrand",
      statusKind: "curse",
      statusMagnitude: 0.28,
      statusDurationMs: 3800,
      bonusDamage: 20,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_shadow.projectile",
  impactVfx: "vfx.ice_shadow.impact",
  idleVfx: "vfx.ice_shadow.idle",
  modelId: "tower_ice_shadow",
};

const lightningShadowTower: TowerDef = {
  id: "tower_lightning_shadow",
  name: "Blackbolt Rune",
  element: "lightning+shadow",
  isFusion: true,
  flavorText: "A coil wound with tattered dark cloth — every arc it throws lands with a curse behind it.",
  tiers: buildTiers(
    { damage: 17, range: 6.1, fireRateMs: 340, projectileSpeed: 24, critChance: 0.2, critMultiplier: 1.9 },
    [270, 580, 1190],
    [1, 1.24, 1.53],
    [
      "A slim coil, wrapped once in ragged dark cloth.",
      "Cloth now covers most of the coil; sparks that pass through it turn violet.",
      "A blackbolt rune-coil — every arc that leaves it crackles with living shadow.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "blackbolt_rune_markedbolt",
      name: "Marked Bolt",
      description: "Brands the target with a curse, then arcs a bolt of curse-charged lightning through it.",
      cooldownMs: 7200,
      vfxId: "vfx.lightning_shadow.ability_markedbolt",
      statusKind: "curse",
      statusMagnitude: 0.28,
      statusDurationMs: 3800,
      bonusDamage: 18,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_shadow.projectile",
  impactVfx: "vfx.lightning_shadow.impact",
  idleVfx: "vfx.lightning_shadow.idle",
  modelId: "tower_lightning_shadow",
};

const natureShadowTower: TowerDef = {
  id: "tower_nature_shadow",
  name: "Withering Bramble",
  element: "nature+shadow",
  isFusion: true,
  flavorText: "A vine-wrapped totem gone grey at the root, growth and rot tangled into one another.",
  tiers: buildTiers(
    { damage: 19, range: 5.7, fireRateMs: 760, projectileSpeed: 15 },
    [258, 555, 1135],
    [1, 1.24, 1.53],
    [
      "A young vine coils the totem, one leaf already withered grey.",
      "Half the vine has gone grey and brittle, thorns darkening at the tip.",
      "A totem of wholly withered bramble, thorns black with the curse it carries.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "withering_bramble_blightthorn",
      name: "Blightthorn",
      description: "Brands the target with a curse, then drives a thorn of withering growth into it.",
      cooldownMs: 7200,
      vfxId: "vfx.nature_shadow.ability_blightthorn",
      statusKind: "curse",
      statusMagnitude: 0.28,
      statusDurationMs: 3800,
      bonusDamage: 19,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_shadow.projectile",
  impactVfx: "vfx.nature_shadow.impact",
  idleVfx: "vfx.nature_shadow.idle",
  modelId: "tower_nature_shadow",
};

const earthShadowTower: TowerDef = {
  id: "tower_earth_shadow",
  name: "Tombstone Warden",
  element: "earth+shadow",
  isFusion: true,
  flavorText: "A leaning cairn of grave-stone, the shadow bound to it older than the stone itself.",
  tiers: buildTiers(
    { damage: 26, range: 5.3, fireRateMs: 1000, projectileSpeed: 13 },
    [268, 576, 1180],
    [1, 1.24, 1.53],
    [
      "A single grave-stone, tilted, one violet rune scratched into its face.",
      "More stones have gathered around it, runes glowing faintly in each.",
      "A tombstone cairn, wholly ringed in violet-lit runes that hum with old curses.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "tombstone_warden_graveseal",
      name: "Grave Seal",
      description: "Brands the target with a curse, then crushes it beneath curse-bound stone.",
      cooldownMs: 7200,
      vfxId: "vfx.earth_shadow.ability_graveseal",
      statusKind: "curse",
      statusMagnitude: 0.28,
      statusDurationMs: 3800,
      bonusDamage: 27,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_shadow.projectile",
  impactVfx: "vfx.earth_shadow.impact",
  idleVfx: "vfx.earth_shadow.idle",
  modelId: "tower_earth_shadow",
};

const arcaneShadowTower: TowerDef = {
  id: "tower_arcane_shadow",
  name: "Voidglass Oracle",
  element: "arcane+shadow",
  isFusion: true,
  flavorText: "A shard of glass that shows no reflection, only a single drifting violet eye.",
  tiers: buildTiers(
    { damage: 21, range: 6.4, fireRateMs: 900, projectileSpeed: 18, critChance: 0.24, critMultiplier: 2 },
    [285, 613, 1255],
    [1, 1.24, 1.53],
    [
      "A small pane of black glass hovers just above its stand.",
      "The glass has widened; a faint eye now drifts within it.",
      "A voidglass oracle, its eye wide open and fixed unblinking on the field.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "voidglass_oracle_foresight",
      name: "Foresight Curse",
      description: "Brands the target with a curse, then unleashes a lance of raw void-arcane force.",
      cooldownMs: 7200,
      vfxId: "vfx.arcane_shadow.ability_foresight",
      statusKind: "curse",
      statusMagnitude: 0.28,
      statusDurationMs: 3800,
      bonusDamage: 23,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_shadow.projectile",
  impactVfx: "vfx.arcane_shadow.impact",
  idleVfx: "vfx.arcane_shadow.idle",
  modelId: "tower_arcane_shadow",
};

// ---------------------------------------------------------------------------
// "Twin" fusions — pairing two IDENTICAL base towers instead of two
// different ones (fire + fire, ice + ice, ...). Recipes live in
// DuplicateFusionMatrix.ts, not FusionMatrix.ts. Each Twin doubles down on
// its element's own signature on-hit status (see ON_HIT_PROC in Game.ts)
// rather than borrowing a second element's identity — "more of the same,
// harder" is the whole point, in contrast to the cross-element fusions
// above. `element` is set to `"<el>+<el>"`, a valid FusionElementPair since
// the template-literal type doesn't require its two halves to differ; the
// sprite/bullet renderers already treat elA===elB fine (primary structure +
// same-element accent motif reads as "amplified", not broken).
// ---------------------------------------------------------------------------

const fireFireTower: TowerDef = {
  id: "tower_fire_fire",
  name: "Twin Ember",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Two cairns fused into one, flame doubled back on itself until it roars.",
  tiers: buildTiers(
    { damage: 25, range: 5.6, fireRateMs: 780, projectileSpeed: 15, splashRadius: 1.3 },
    [258, 555, 1135],
    [1, 1.24, 1.53],
    [
      "Twin flames lean into each other atop a shared cairn, feeding off one another.",
      "The flames have merged into one taller, hungrier blaze.",
      "A single roaring inferno, doubled fuel behind every guttering tongue.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_ember_deep_ignite",
      name: "Deep Ignite",
      description: "A doubled-up Ignite — sets the target ablaze with a far fiercer, longer-lasting burn.",
      cooldownMs: 6500,
      vfxId: "vfx.fire_fire.ability_deep_ignite",
      statusKind: "burn",
      statusMagnitude: 8,
      statusDurationMs: 3000,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire.projectile",
  impactVfx: "vfx.fire_fire.impact",
  idleVfx: "vfx.fire_fire.idle",
  modelId: "tower_fire_fire",
};

const iceIceTower: TowerDef = {
  id: "tower_ice_ice",
  name: "Twin Frost",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Two spires grown into one lattice of ice, colder at the seam than at either tip.",
  tiers: buildTiers(
    { damage: 20, range: 5.9, fireRateMs: 820, projectileSpeed: 16 },
    [255, 550, 1120],
    [1, 1.24, 1.53],
    [
      "Twin crystal spires lean together, frost bridging the gap between them.",
      "The bridge has thickened into a single fused lattice of ice.",
      "One vast lattice spire, doubled cold radiating from every facet.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_frost_deep_chill",
      name: "Deep Chill",
      description: "A doubled-up chill — slows the target far harder and for far longer than a single spire could.",
      cooldownMs: 6500,
      vfxId: "vfx.ice_ice.ability_deep_chill",
      statusKind: "chill",
      statusMagnitude: 0.45,
      statusDurationMs: 2200,
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_ice.projectile",
  impactVfx: "vfx.ice_ice.impact",
  idleVfx: "vfx.ice_ice.idle",
  modelId: "tower_ice_ice",
};

const lightningLightningTower: TowerDef = {
  id: "tower_lightning_lightning",
  name: "Twin Storm",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Two masts wound into one coil, current chasing itself around the loop.",
  tiers: buildTiers(
    { damage: 15, range: 6.1, fireRateMs: 300, projectileSpeed: 25, critChance: 0.24, critMultiplier: 2 },
    [272, 585, 1195],
    [1, 1.24, 1.53],
    [
      "Twin masts stand side by side, a single spark leaping between them.",
      "The masts have fused at the base, current now looping continuously.",
      "One towering coil-mast, doubled current arcing off it in every direction.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_storm_overcharge",
      name: "Overcharge",
      description: "A doubled-up Overcharge — locks the target down harder and drains far more of its speed.",
      cooldownMs: 6500,
      vfxId: "vfx.lightning_lightning.ability_overcharge",
      statusKind: "shock",
      statusMagnitude: 0.75,
      statusDurationMs: 1000,
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_lightning.projectile",
  impactVfx: "vfx.lightning_lightning.impact",
  idleVfx: "vfx.lightning_lightning.idle",
  modelId: "tower_lightning_lightning",
};

const natureNatureTower: TowerDef = {
  id: "tower_nature_nature",
  name: "Twin Thorn",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Two saplings grown into one trunk, roots and thorns doubled at every turn.",
  tiers: buildTiers(
    { damage: 17, range: 5.7, fireRateMs: 720, projectileSpeed: 15 },
    [248, 535, 1090],
    [1, 1.24, 1.53],
    [
      "Twin saplings share one root, vines already crossing between them.",
      "The trunks have merged into one, thorns doubled along its bark.",
      "One great thorned trunk, canopies fused into a single sprawling crown.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_thorn_deep_venom",
      name: "Deep Venom",
      description: "A doubled-up venom — poisons the target far more virulently and for far longer.",
      cooldownMs: 6500,
      vfxId: "vfx.nature_nature.ability_deep_venom",
      statusKind: "poison",
      statusMagnitude: 6,
      statusDurationMs: 3200,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_nature.projectile",
  impactVfx: "vfx.nature_nature.impact",
  idleVfx: "vfx.nature_nature.idle",
  modelId: "tower_nature_nature",
};

const earthEarthTower: TowerDef = {
  id: "tower_earth_earth",
  name: "Twin Stone",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Two boulder cairns stacked into one, the seam between them long since fused solid.",
  tiers: buildTiers(
    { damage: 30, range: 5.3, fireRateMs: 1050, projectileSpeed: 13, splashRadius: 1.5 },
    [262, 565, 1150],
    [1, 1.24, 1.53],
    [
      "Twin boulder stacks lean against one another, a crack of light between them.",
      "The stacks have fused solid, one mass of stone where two used to be.",
      "One immense cairn, doubled weight behind every stone it hurls.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_stone_deep_sunder",
      name: "Deep Sunder",
      description: "A doubled-up Sunder — cracks far more of the target's armor away, for far longer.",
      cooldownMs: 6500,
      vfxId: "vfx.earth_earth.ability_deep_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.3,
      statusDurationMs: 3200,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth.projectile",
  impactVfx: "vfx.earth_earth.impact",
  idleVfx: "vfx.earth_earth.idle",
  modelId: "tower_earth_earth",
};

const arcaneArcaneTower: TowerDef = {
  id: "tower_arcane_arcane",
  name: "Twin Rune",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Two obelisks hovering so close their glyph-rings have merged into one.",
  tiers: buildTiers(
    { damage: 18, range: 6.2, fireRateMs: 900, projectileSpeed: 17, critChance: 0.26, critMultiplier: 2.2 },
    [288, 620, 1265],
    [1, 1.24, 1.53],
    [
      "Twin obelisks hover close together, their glyph-rings just touching.",
      "The rings have merged into one wider band circling both obelisks.",
      "One doubled obelisk, glyph-rings fused into a single blazing halo.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_rune_deep_silence",
      name: "Deep Silence",
      description: "A doubled-up Silence — suppresses the target's abilities for far longer than one obelisk could alone.",
      cooldownMs: 6500,
      vfxId: "vfx.arcane_arcane.ability_deep_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2000,
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_arcane.projectile",
  impactVfx: "vfx.arcane_arcane.impact",
  idleVfx: "vfx.arcane_arcane.idle",
  modelId: "tower_arcane_arcane",
};

const shadowShadowTower: TowerDef = {
  id: "tower_shadow_shadow",
  name: "Twin Wraith",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Two cloaks of living dark wound into one shroud, three eyes where there used to be one.",
  tiers: buildTiers(
    { damage: 15, range: 5.8, fireRateMs: 880, projectileSpeed: 16 },
    [270, 580, 1190],
    [1, 1.24, 1.53],
    [
      "Twin wisps of shadow coil around a shared cairn, eyes half-open.",
      "The wisps have wound into one thicker shroud, both eyes fully open.",
      "One vast shroud of living dark, every eye upon it watching at once.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twin_wraith_deep_curse",
      name: "Deep Curse",
      description: "A doubled-up Curse — brands the target far more severely, making it take much heavier damage.",
      cooldownMs: 6500,
      vfxId: "vfx.shadow_shadow.ability_deep_curse",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 3200,
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.shadow_shadow.projectile",
  impactVfx: "vfx.shadow_shadow.impact",
  idleVfx: "vfx.shadow_shadow.idle",
  modelId: "tower_shadow_shadow",
};

// ---------------------------------------------------------------------------
// Grand Fusion towers — tri-element capstones, one merge tier deeper than
// the 15 base fusions above (a 2-element fusion tower + a third base
// element it doesn't already contain). Recipes live in
// GrandFusionMatrix.ts, not FusionMatrix.ts (kept separate for clarity —
// the two matrices answer different questions: "which 2 elements make
// this fusion" vs. "which fusion + which 3rd element makes this capstone").
//
// `element` field decision: `FusionElementPair` is strictly
// `${Element}+${Element}` — it cannot express three elements without
// widening a type other code already depends on, which is out of scope
// here. Each Grand Fusion's `element` is instead set to its PARENT fusion
// tower's pair (the 2-element fusion actually consumed by the recipe); the
// third element is fully represented in the id, name, flavorText, and
// ability, just not in this one typed field. E.g. Tempest Core consumes
// Steamcaller (fire+ice) + a lightning tower, so its `element` is
// `"fire+ice"` even though it is thematically a fire+ice+lightning tower.
//
// Ids/vfx ids follow the same convention as the 2-element fusions: element
// names joined in ELEMENTS order (fire, ice, lightning, nature, earth,
// arcane), e.g. `tower_fire_ice_lightning`, `vfx.fire_ice_lightning.impact`.
// Costs step up sharply from a single fusion (tier-1 ~250-280 for a base
// fusion vs. ~600-660 here) to reflect that a Grand Fusion consumes a whole
// fusion tower plus a base tower's worth of investment.
//
// As of the third curation pass (see further down this section) all 20 of
// the C(6,3) = 20 possible element triads have a Grand Fusion tower defined.
// The matrix is combinatorially complete — there is no 21st triad to add.
// ---------------------------------------------------------------------------

const fireIceLightningTower: TowerDef = {
  id: "tower_fire_ice_lightning",
  name: "Tempest Core",
  element: "fire+ice",
  isFusion: true,
  flavorText:
    "A geyser-forged reactor where scalding steam ionizes into a captive storm — fire, ice, and lightning locked in violent equilibrium.",
  tiers: buildTiers(
    { damage: 34, range: 6.2, fireRateMs: 520, projectileSpeed: 20, splashRadius: 1.6 },
    [620, 1280, 2550],
    [1, 1.22, 1.5],
    [
      "A cracked ice vent now crackles with trapped lightning threading through its steam.",
      "The vent has become a coiled reactor core, storm-charged steam roiling around a lightning-veined crystal spine.",
      "A full tempest reactor — superheated steam, jagged ice, and continuous lightning locked in a self-sustaining storm.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "tempest_core_cataclysmic_squall",
      name: "Cataclysmic Squall",
      description:
        "Grand Fusion capstone. Vents the whole reactor at once — a scalding, freezing, lightning-charged squall that shocks and burns the target severely.",
      cooldownMs: 9500,
      vfxId: "vfx.fire_ice_lightning.ability_squall",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 2500,
      bonusDamage: 45,
      damageElement: "lightning",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_ice_lightning.projectile",
  impactVfx: "vfx.fire_ice_lightning.impact",
  idleVfx: "vfx.fire_ice_lightning.idle",
  modelId: "tower_fire_ice_lightning",
};

const fireNatureEarthTower: TowerDef = {
  id: "tower_fire_nature_earth",
  name: "Ashgrove Titan",
  element: "fire+earth",
  isFusion: true,
  flavorText:
    "A volcanic colossus whose molten cracks have been overtaken by fire-blooming vines — destruction and rebirth fused into one titan.",
  tiers: buildTiers(
    { damage: 46, range: 5.0, fireRateMs: 1400, projectileSpeed: 11, splashRadius: 2.0 },
    [640, 1320, 2620],
    [1, 1.25, 1.55],
    [
      "Boulders still weep magma, but the first fire-blossom vines have already taken root in the cracks.",
      "Thick ember-vines now wrap the whole cairn, blossoms glowing like coals among the molten stone.",
      "A true titan of living magma-stone, a canopy of fire-blossoms crowning a body of molten rock and root.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "ashgrove_titan_wildfire_eruption",
      name: "Wildfire Eruption",
      description:
        "Grand Fusion capstone. Erupts a blast of molten rock and living spores at once, poisoning the target while it burns from a massive fire detonation.",
      cooldownMs: 10000,
      vfxId: "vfx.fire_nature_earth.ability_eruption",
      statusKind: "poison",
      statusMagnitude: 8,
      statusDurationMs: 5000,
      bonusDamage: 60,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_nature_earth.projectile",
  impactVfx: "vfx.fire_nature_earth.impact",
  idleVfx: "vfx.fire_nature_earth.idle",
  modelId: "tower_fire_nature_earth",
};

const iceNatureArcaneTower: TowerDef = {
  id: "tower_ice_nature_arcane",
  name: "Elderfrost Sanctum",
  element: "ice+nature",
  isFusion: true,
  flavorText:
    "An ancient world-tree encased in eternal frost, its frozen boughs strung with slow-turning rings of ward-light.",
  tiers: buildTiers(
    { damage: 24, range: 6.8, fireRateMs: 750, projectileSpeed: 14, critChance: 0.26, critMultiplier: 2.2 },
    [610, 1260, 2500],
    [1, 1.24, 1.52],
    [
      "A frost-sheathed sapling, one faint glyph ring drifting through its icy canopy.",
      "The canopy has widened beneath its ice shell, two glyph rings now circling it in counter-motion.",
      "An elder sanctum tree, permafrost and rune-light fused into a canopy that hums with ancient ward-magic.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "elderfrost_sanctum_winters_ward",
      name: "Winter's Ward",
      description:
        "Grand Fusion capstone. Envelops the target in a rune-warded flash-freeze, locking it solid while ancient arcane force gouges through the ice.",
      cooldownMs: 9500,
      vfxId: "vfx.ice_nature_arcane.ability_winters_ward",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 2200,
      bonusDamage: 32,
      damageElement: "arcane",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_nature_arcane.projectile",
  impactVfx: "vfx.ice_nature_arcane.impact",
  idleVfx: "vfx.ice_nature_arcane.idle",
  modelId: "tower_ice_nature_arcane",
};

const lightningEarthArcaneTower: TowerDef = {
  id: "tower_lightning_earth_arcane",
  name: "Stormforge Sovereign",
  element: "earth+arcane",
  isFusion: true,
  flavorText: "A sovereign monolith wreathed in storm-charged sigils, each rivet arcing with captured lightning.",
  tiers: buildTiers(
    { damage: 38, range: 6.0, fireRateMs: 780, projectileSpeed: 18, critChance: 0.24, critMultiplier: 2.2 },
    [650, 1340, 2650],
    [1, 1.26, 1.56],
    [
      "A rune-slab monolith, one glyph now sparking faintly with trapped current.",
      "Two glyphs blaze, rivets arcing visibly with captured storm-charge between them.",
      "A sovereign monolith, every glyph and rivet alive with continuous lightning bound in stone and rune.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormforge_sovereign_judgment_circuit",
      name: "Judgment Circuit",
      description:
        "Grand Fusion capstone. Routes the monolith's full storm-charge through the target's armor, sundering it and unleashing a devastating lightning surge.",
      cooldownMs: 10500,
      vfxId: "vfx.lightning_earth_arcane.ability_judgment",
      statusKind: "sunder",
      statusMagnitude: 0.35,
      statusDurationMs: 4500,
      bonusDamage: 50,
      damageElement: "lightning",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.lightning_earth_arcane.projectile",
  impactVfx: "vfx.lightning_earth_arcane.impact",
  idleVfx: "vfx.lightning_earth_arcane.idle",
  modelId: "tower_lightning_earth_arcane",
};

const fireLightningArcaneTower: TowerDef = {
  id: "tower_fire_lightning_arcane",
  name: "Voidfire Nexus",
  element: "fire+lightning",
  isFusion: true,
  flavorText: "An unstable miniature star, contained only by interlocking rings of arcane warding.",
  tiers: buildTiers(
    { damage: 30, range: 6.4, fireRateMs: 340, projectileSpeed: 28, critChance: 0.3, critMultiplier: 2.4 },
    [660, 1360, 2680],
    [1, 1.24, 1.5],
    [
      "A caged plasma mote now drifts inside a single faint ward-ring.",
      "Two ward-rings spin around a swelling plasma core, sparks leaping against the containment.",
      "A captive dying star — three ward-rings barely containing the plasma-lightning maelstrom within.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "voidfire_nexus_starfall_discharge",
      name: "Starfall Discharge",
      description:
        "Grand Fusion capstone. Briefly drops the warding rings, releasing the full fury of the captive star as a shocking, incinerating discharge.",
      cooldownMs: 8500,
      vfxId: "vfx.fire_lightning_arcane.ability_starfall",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 3000,
      bonusDamage: 65,
      damageElement: "fire",
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.fire_lightning_arcane.projectile",
  impactVfx: "vfx.fire_lightning_arcane.impact",
  idleVfx: "vfx.fire_lightning_arcane.idle",
  modelId: "tower_fire_lightning_arcane",
};

const iceNatureEarthTower: TowerDef = {
  id: "tower_ice_nature_earth",
  name: "Wildfrost Bastion",
  element: "ice+earth",
  isFusion: true,
  flavorText:
    "A rampart of ancient glacier-stone reclaimed by hardy frost-vines — immovable, and growing more so every season.",
  tiers: buildTiers(
    { damage: 42, range: 4.8, fireRateMs: 1550, projectileSpeed: 9, splashRadius: 1.9 },
    [630, 1300, 2580],
    [1, 1.27, 1.58],
    [
      "A rampart of alternating rock and ice, the first frost-hardy vines threading its cracks.",
      "Vines now lattice the whole rampart, ice and root grown inseparable.",
      "A living bastion of glacier and root — an unmoving wall, ancient and steadily, unstoppably growing.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wildfrost_bastion_everfrost_bloom",
      name: "Everfrost Bloom",
      description:
        "Grand Fusion capstone. Roots the target under a sudden lattice of frozen vines bursting from the rampart, crushing and immobilizing it.",
      cooldownMs: 9500,
      vfxId: "vfx.ice_nature_earth.ability_bloom",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 3200,
      bonusDamage: 40,
      damageElement: "ice",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_nature_earth.projectile",
  impactVfx: "vfx.ice_nature_earth.impact",
  idleVfx: "vfx.ice_nature_earth.idle",
  modelId: "tower_ice_nature_earth",
};

// ---------------------------------------------------------------------------
// Grand Fusion towers, second curation pass — 6 more triads added on top of
// the original 6 above. Same conventions throughout (buildTiers/makeAbility,
// isFusion: true, `element` set to the PARENT fusion's pair per the decision
// documented above, id/vfx ids joined in ELEMENTS order). See
// GrandFusionMatrix.ts for why these particular 6 of the remaining 14
// uncovered triads were chosen.
// ---------------------------------------------------------------------------

const fireIceNatureTower: TowerDef = {
  id: "tower_fire_ice_nature",
  name: "Verdant Geyser",
  element: "fire+ice",
  isFusion: true,
  flavorText:
    "A crystalline vent overtaken by living jungle growth — scalding steam feeds a canopy that blooms even as it scalds.",
  tiers: buildTiers(
    { damage: 30, range: 6.2, fireRateMs: 680, projectileSpeed: 14, splashRadius: 1.65 },
    [625, 1290, 2560],
    [1, 1.24, 1.54],
    [
      "Steam-slick vines have taken root around the crystal vent, first blossoms unfurling in the scalding mist.",
      "The vent is now half-swallowed by jungle growth, thick blossoms glowing amid roiling clouds of vapor.",
      "A living geyser — a canopy of scald-blooming flora erupts continuously from a core of screaming steam and ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "verdant_geyser_scalding_bloom",
      name: "Scalding Bloom",
      description:
        "Grand Fusion capstone. Vents a burst of spore-laden steam that scalds the target and leaves festering spores to poison it long after.",
      cooldownMs: 9000,
      vfxId: "vfx.fire_ice_nature.ability_scalding_bloom",
      statusKind: "poison",
      statusMagnitude: 7,
      statusDurationMs: 4800,
      bonusDamage: 34,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_ice_nature.projectile",
  impactVfx: "vfx.fire_ice_nature.impact",
  idleVfx: "vfx.fire_ice_nature.idle",
  modelId: "tower_fire_ice_nature",
};

const iceLightningArcaneTower: TowerDef = {
  id: "tower_ice_lightning_arcane",
  name: "Stormglass Oracle",
  element: "ice+lightning",
  isFusion: true,
  flavorText:
    "A lightning-veined ice shard turned seer's lens — every facet shows a flicker of the future it's about to strike.",
  tiers: buildTiers(
    { damage: 26, range: 6.6, fireRateMs: 440, projectileSpeed: 26, critChance: 0.27, critMultiplier: 2.25 },
    [615, 1270, 2510],
    [1, 1.23, 1.5],
    [
      "A single ice shard crackles with trapped lightning; one faint glyph now orbits within its cracks.",
      "The shard has split into a fan of crystal facets, two glyph rings drifting through the arcing light.",
      "A towering stormglass lens — glyph rings spin through a lattice of lightning-shot ice, each facet flickering with foresight.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormglass_oracle_fateshard_fracture",
      name: "Fateshard Fracture",
      description:
        "Grand Fusion capstone. Freezes the target within a lightning-veined shard that violently fractures, shocking it and unravelling its defenses.",
      cooldownMs: 9000,
      vfxId: "vfx.ice_lightning_arcane.ability_fateshard",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 1900,
      bonusDamage: 30,
      damageElement: "arcane",
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.ice_lightning_arcane.projectile",
  impactVfx: "vfx.ice_lightning_arcane.impact",
  idleVfx: "vfx.ice_lightning_arcane.idle",
  modelId: "tower_ice_lightning_arcane",
};

const fireLightningEarthTower: TowerDef = {
  id: "tower_fire_lightning_earth",
  name: "Fulgurite Forge",
  element: "lightning+earth",
  isFusion: true,
  flavorText:
    "Where the coil's tremors call down lightning, the struck stone melts and fuses into glassy fulgurite — a forge that arms itself.",
  tiers: buildTiers(
    { damage: 44, range: 5.2, fireRateMs: 940, projectileSpeed: 12, splashRadius: 1.95 },
    [645, 1330, 2630],
    [1, 1.27, 1.6],
    [
      "The coiled pillar now runs molten at its fault-lines, the first veins of glassy fulgurite fusing where lightning struck stone.",
      "Fulgurite veins spread across the whole pillar, glowing white-gold where coil and cracked magma meet.",
      "A forge given seismic violence — glassy lightning-glass veins net a molten, coil-bound pillar that never stops trembling.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "fulgurite_forge_cataclysmic_strike",
      name: "Cataclysmic Strike",
      description:
        "Grand Fusion capstone. Calls down a molten lightning bolt that fuses the ground to glass, sundering the target's armor and detonating for severe fire damage.",
      cooldownMs: 10500,
      vfxId: "vfx.fire_lightning_earth.ability_cataclysmic_strike",
      statusKind: "sunder",
      statusMagnitude: 0.34,
      statusDurationMs: 4200,
      bonusDamage: 58,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_lightning_earth.projectile",
  impactVfx: "vfx.fire_lightning_earth.impact",
  idleVfx: "vfx.fire_lightning_earth.idle",
  modelId: "tower_fire_lightning_earth",
};

const natureEarthArcaneTower: TowerDef = {
  id: "tower_nature_earth_arcane",
  name: "Wardroot Sentinel",
  element: "nature+earth",
  isFusion: true,
  flavorText:
    "A moss-bound colossus raised further by rings of guardian rune-light, standing eternal watch over the roots it protects.",
  tiers: buildTiers(
    { damage: 40, range: 5.6, fireRateMs: 1150, projectileSpeed: 11, splashRadius: 1.7, critChance: 0.2, critMultiplier: 2.15 },
    [605, 1250, 2490],
    [1, 1.28, 1.6],
    [
      "A single moss-boulder now carries one faint ward-glyph, rune-light threading through its cracks.",
      "Two boulders stack beneath a ring of guardian glyphs, vines and stone bound tighter by arcane will.",
      "A true sentinel colossus — thorned root, ancient stone, and twin glyph rings fused into one unmoving guardian.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wardroot_sentinel_ancient_ward",
      name: "Ancient Ward",
      description:
        "Grand Fusion capstone. Binds the target beneath crushing roots warded by old rune-magic, rooting it in place while arcane force gouges through its defenses.",
      cooldownMs: 10000,
      vfxId: "vfx.nature_earth_arcane.ability_ancient_ward",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 3200,
      bonusDamage: 36,
      damageElement: "arcane",
    }),
  ],
  targeting: "last",
  projectileVfx: "vfx.nature_earth_arcane.projectile",
  impactVfx: "vfx.nature_earth_arcane.impact",
  idleVfx: "vfx.nature_earth_arcane.idle",
  modelId: "tower_nature_earth_arcane",
};

const lightningNatureEarthTower: TowerDef = {
  id: "tower_lightning_nature_earth",
  name: "Stormroot Monument",
  element: "lightning+nature",
  isFusion: true,
  flavorText:
    "A storm-thorn totem anchored in raw bedrock, roots deep enough to draw lightning up out of the stone itself.",
  tiers: buildTiers(
    { damage: 26, range: 5.6, fireRateMs: 520, projectileSpeed: 15, splashRadius: 1.35 },
    [655, 1350, 2660],
    [1, 1.25, 1.55],
    [
      "The young totem's roots have cracked into surrounding bedrock, one boulder already humming with static.",
      "Boulders now ring the totem's base, storm-charged roots binding stone and thorn together.",
      "A monument of stone and living thorn, lightning arcing continuously between root, rock, and sky.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormroot_monument_thunderroot_upheaval",
      name: "Thunderroot Upheaval",
      description:
        "Grand Fusion capstone. Roots crack up through the earth around the target, shocking and pinning it as the ground itself convulses.",
      cooldownMs: 9500,
      vfxId: "vfx.lightning_nature_earth.ability_thunderroot",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 2400,
      bonusDamage: 30,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_nature_earth.projectile",
  impactVfx: "vfx.lightning_nature_earth.impact",
  idleVfx: "vfx.lightning_nature_earth.idle",
  modelId: "tower_lightning_nature_earth",
};

const fireNatureArcaneTower: TowerDef = {
  id: "tower_fire_nature_arcane",
  name: "Emberroot Sigil",
  element: "fire+arcane",
  isFusion: true,
  flavorText:
    "Living roots have cracked through the obsidian sigil, drawing the bound flame into every burning vine that grows from it.",
  tiers: buildTiers(
    { damage: 34, range: 6.4, fireRateMs: 820, projectileSpeed: 17, critChance: 0.3, critMultiplier: 2.3 },
    [635, 1310, 2590],
    [1, 1.26, 1.53],
    [
      "Obsidian glyphs crack as the first burning vine roots into the sigil's stone.",
      "Ember-vines now wrap the whole obelisk, glyph rings glowing through a lattice of living growth.",
      "A sigil consumed by its own captive fire and roots alike — glyphs, vine, and flame grown into one inseparable brand.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "emberroot_sigil_verdant_hellmark",
      name: "Verdant Hellmark",
      description:
        "Grand Fusion capstone. Brands the target with a living sigil of root and flame, poisoning it with burning sap before a final searing detonation.",
      cooldownMs: 9000,
      vfxId: "vfx.fire_nature_arcane.ability_hellmark",
      statusKind: "poison",
      statusMagnitude: 6,
      statusDurationMs: 4500,
      bonusDamage: 42,
      damageElement: "fire",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.fire_nature_arcane.projectile",
  impactVfx: "vfx.fire_nature_arcane.impact",
  idleVfx: "vfx.fire_nature_arcane.idle",
  modelId: "tower_fire_nature_arcane",
};

// ---------------------------------------------------------------------------
// Grand Fusion towers, third curation pass — the final 8 triads, completing
// all C(6,3) = 20 possible element combinations. Same conventions throughout
// (buildTiers/makeAbility, isFusion: true, `element` set to the PARENT
// fusion's pair, id/vfx ids joined in ELEMENTS order). See
// GrandFusionMatrix.ts for the parent-fusion+third-element path chosen for
// each of these 8, and why.
// ---------------------------------------------------------------------------

const fireIceEarthTower: TowerDef = {
  id: "tower_fire_ice_earth",
  name: "Cinderglass Crucible",
  element: "ice+earth",
  isFusion: true,
  flavorText:
    "The glacier bastion's frozen heart has cracked open around a molten crucible — rock, ice, and fire fused into scalding cinderglass that never fully cools.",
  tiers: buildTiers(
    { damage: 48, range: 5.2, fireRateMs: 1300, projectileSpeed: 11, splashRadius: 2.15 },
    [650, 1340, 2650],
    [1, 1.25, 1.55],
    [
      "A crack has split the rampart's ice core, molten crucible-glass pooling within the fracture.",
      "The fracture has widened into a true crucible, glowing cinderglass fused seamlessly with rock and ice.",
      "A colossal cinderglass crucible — glacier, stone, and molten fire locked in one scalding, unmelting mass.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "cinderglass_crucible_ashglass_rupture",
      name: "Ashglass Rupture",
      description:
        "Grand Fusion capstone. Shatters molten cinderglass across the target, chilling it as jagged fire-glass shards embed and burn deep.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_ice_earth.ability_ashglass_rupture",
      statusKind: "chill",
      statusMagnitude: 0.4,
      statusDurationMs: 3200,
      bonusDamage: 52,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_ice_earth.projectile",
  impactVfx: "vfx.fire_ice_earth.impact",
  idleVfx: "vfx.fire_ice_earth.idle",
  modelId: "tower_fire_ice_earth",
};

const fireIceArcaneTower: TowerDef = {
  id: "tower_fire_ice_arcane",
  name: "Scaldweave Reliquary",
  element: "ice+arcane",
  isFusion: true,
  flavorText:
    "The frostweave loom's threads have been rewoven with captive flame — a floating reliquary where scalding fire, living ice, and rune-light twist through each other in eternal contradiction.",
  tiers: buildTiers(
    { damage: 28, range: 7.0, fireRateMs: 620, projectileSpeed: 24, critChance: 0.32, critMultiplier: 2.35 },
    [660, 1360, 2690],
    [1, 1.22, 1.5],
    [
      "A single burning thread now runs through the loom's woven ice, glowing faintly amid the frost.",
      "Flame has spread through half the weave, scalding light bleeding through cracked ice threads.",
      "A true reliquary of contradiction — fire, ice, and rune-light woven into one incandescent, unmelting tapestry.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "scaldweave_reliquary_unweaving_flare",
      name: "Unweaving Flare",
      description:
        "Grand Fusion capstone. Unravels the target's defenses into silence, then scalds it with a burst of the reliquary's captive fire.",
      cooldownMs: 8800,
      vfxId: "vfx.fire_ice_arcane.ability_unweaving_flare",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2800,
      bonusDamage: 48,
      damageElement: "fire",
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.fire_ice_arcane.projectile",
  impactVfx: "vfx.fire_ice_arcane.impact",
  idleVfx: "vfx.fire_ice_arcane.idle",
  modelId: "tower_fire_ice_arcane",
};

const fireLightningNatureTower: TowerDef = {
  id: "tower_fire_lightning_nature",
  name: "Thornfire Maelstrom",
  element: "fire+nature",
  isFusion: true,
  flavorText:
    "The wildfire warden's burning boughs have been seized by a storm of their own making — thorned branches lash with lightning even as they burn, a maelstrom that never consumes itself.",
  tiers: buildTiers(
    { damage: 32, range: 6.2, fireRateMs: 460, projectileSpeed: 17, splashRadius: 1.5 },
    [625, 1290, 2560],
    [1, 1.24, 1.53],
    [
      "A single storm-thorn has sprouted from the burning trunk, sparking amid the flame.",
      "Lightning now chases the fire up every burning branch, thorns snapping with static discharge.",
      "A maelstrom given living shape — every burning branch a torch, every thorn a lightning rod.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "thornfire_maelstrom_thornstrike_inferno",
      name: "Thornstrike Inferno",
      description:
        "Grand Fusion capstone. Lashes the target with burning storm-thorns, igniting it before a heavy lightning surge detonates through the burn.",
      cooldownMs: 9700,
      vfxId: "vfx.fire_lightning_nature.ability_thornstrike_inferno",
      statusKind: "burn",
      statusMagnitude: 9,
      statusDurationMs: 4200,
      bonusDamage: 46,
      damageElement: "lightning",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_lightning_nature.projectile",
  impactVfx: "vfx.fire_lightning_nature.impact",
  idleVfx: "vfx.fire_lightning_nature.idle",
  modelId: "tower_fire_lightning_nature",
};

const fireEarthArcaneTower: TowerDef = {
  id: "tower_fire_earth_arcane",
  name: "Moltenglyph Cauldron",
  element: "fire+earth",
  isFusion: true,
  flavorText:
    "The magma forge's molten heart has been bound inside a rune-carved cauldron — arcane glyphs channel the boiling rock into a controlled, ever-hungry brew of liquid stone and fire.",
  tiers: buildTiers(
    { damage: 50, range: 5.2, fireRateMs: 1250, projectileSpeed: 12, splashRadius: 2.2 },
    [645, 1330, 2630],
    [1, 1.27, 1.58],
    [
      "A single glyph now rings the molten boulder stack, faintly containing its glow.",
      "Two glyph rings channel the boiling rock into a cauldron shape, runes bright against the magma.",
      "A true rune-cauldron — molten stone churns endlessly within a lattice of blazing arcane containment.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "moltenglyph_cauldron_sigilbound_boil",
      name: "Sigilbound Boil",
      description:
        "Grand Fusion capstone. Cracks the target's defenses with a sundering rune-shockwave, then floods the wound with boiling arcane-charged magma.",
      cooldownMs: 10200,
      vfxId: "vfx.fire_earth_arcane.ability_sigilbound_boil",
      statusKind: "sunder",
      statusMagnitude: 0.34,
      statusDurationMs: 4500,
      bonusDamage: 60,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_earth_arcane.projectile",
  impactVfx: "vfx.fire_earth_arcane.impact",
  idleVfx: "vfx.fire_earth_arcane.idle",
  modelId: "tower_fire_earth_arcane",
};

const iceLightningNatureTower: TowerDef = {
  id: "tower_ice_lightning_nature",
  name: "Rimethorn Cyclone",
  element: "lightning+nature",
  isFusion: true,
  flavorText:
    "The thornstorm totem's living storm cloud has curdled into a cyclone of ice — frozen thorns spark and arc within a whirling shell of frost and static.",
  tiers: buildTiers(
    { damage: 22, range: 6.4, fireRateMs: 340, projectileSpeed: 26 },
    [610, 1260, 2500],
    [1, 1.23, 1.5],
    [
      "A thin rime has crept over the totem's sparking thorns, frost and static crackling together.",
      "A whirling shell of ice has formed around the totem, thorns arcing visibly beneath it.",
      "A full cyclone of frost and current — every thorn frozen, sparking, and locked in ceaseless whirling motion.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "rimethorn_cyclone_hoarfrost_torrent",
      name: "Hoarfrost Torrent",
      description:
        "Grand Fusion capstone. Locks the target in a whirling shell of ice, then drives a lightning surge through the frozen cage.",
      cooldownMs: 8600,
      vfxId: "vfx.ice_lightning_nature.ability_hoarfrost_torrent",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 2100,
      bonusDamage: 36,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.ice_lightning_nature.projectile",
  impactVfx: "vfx.ice_lightning_nature.impact",
  idleVfx: "vfx.ice_lightning_nature.idle",
  modelId: "tower_ice_lightning_nature",
};

const iceLightningEarthTower: TowerDef = {
  id: "tower_ice_lightning_earth",
  name: "Glacequake Redoubt",
  element: "lightning+earth",
  isFusion: true,
  flavorText:
    "The seismic coil's fault-cracked pillar has frozen solid mid-tremor — each quake now shatters through solid ice in cascading, storm-charged shockwaves from this glacial redoubt.",
  tiers: buildTiers(
    { damage: 40, range: 5.4, fireRateMs: 880, projectileSpeed: 14, splashRadius: 2.0 },
    [640, 1320, 2610],
    [1, 1.26, 1.56],
    [
      "Frost has crept into the pillar's fault-lines, ice creaking against the coil's current.",
      "The whole pillar has frozen mid-tremor, cracks of ice and lightning locked together.",
      "A glacial redoubt — a frozen seismic pillar that shatters ice in every direction with each thunderous quake.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "glacequake_redoubt_shattering_upheaval",
      name: "Shattering Upheaval",
      description:
        "Grand Fusion capstone. Cracks the earth beneath the target in a frozen shockwave, sundering its armor and driving jagged ice shrapnel through the wound.",
      cooldownMs: 9800,
      vfxId: "vfx.ice_lightning_earth.ability_shattering_upheaval",
      statusKind: "sunder",
      statusMagnitude: 0.33,
      statusDurationMs: 4300,
      bonusDamage: 54,
      damageElement: "ice",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_lightning_earth.projectile",
  impactVfx: "vfx.ice_lightning_earth.impact",
  idleVfx: "vfx.ice_lightning_earth.idle",
  modelId: "tower_ice_lightning_earth",
};

const iceEarthArcaneTower: TowerDef = {
  id: "tower_ice_earth_arcane",
  name: "Frostbound Ossuary",
  element: "earth+arcane",
  isFusion: true,
  flavorText:
    "The runeforge monolith has been sealed in eternal frost — an ossuary of rune-riveted stone where ancient forge-glyphs glow faintly beneath a shell of unmelting ice.",
  tiers: buildTiers(
    { damage: 44, range: 6.0, fireRateMs: 900, projectileSpeed: 16, critChance: 0.26, critMultiplier: 2.2 },
    [635, 1310, 2600],
    [1, 1.25, 1.55],
    [
      "A thin rime has crept across the slab's glyphs, ice creeping into every rivet.",
      "The slab is now half-sheathed in ice, glyphs glowing dimly beneath the frozen shell.",
      "A true ossuary of frost and rune — the monolith fully sealed in ice, ancient glyphs still burning on beneath it.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frostbound_ossuary_glacial_epitaph",
      name: "Glacial Epitaph",
      description:
        "Grand Fusion capstone. Seals the target in rune-warded ice, freezing it solid as arcane force gouges through the crystalline shell.",
      cooldownMs: 9300,
      vfxId: "vfx.ice_earth_arcane.ability_glacial_epitaph",
      statusKind: "freeze",
      statusMagnitude: 1,
      statusDurationMs: 2400,
      bonusDamage: 38,
      damageElement: "earth",
    }),
  ],
  targeting: "last",
  projectileVfx: "vfx.ice_earth_arcane.projectile",
  impactVfx: "vfx.ice_earth_arcane.impact",
  idleVfx: "vfx.ice_earth_arcane.idle",
  modelId: "tower_ice_earth_arcane",
};

const lightningNatureArcaneTower: TowerDef = {
  id: "tower_lightning_nature_arcane",
  name: "Bramblecharge Conclave",
  element: "lightning+arcane",
  isFusion: true,
  flavorText:
    "The arcflux spire's sleek conduit has been consumed by storm-charged bramble — living vines conduct the current now, gathering into a conclave where lightning and living wood are inseparable.",
  tiers: buildTiers(
    { damage: 24, range: 6.8, fireRateMs: 300, projectileSpeed: 27, critChance: 0.26, critMultiplier: 2.1 },
    [655, 1350, 2670],
    [1, 1.24, 1.52],
    [
      "A single living bramble has taken root at the spire's base, sparking faintly where vine meets metal.",
      "Brambles now climb half the spire, storm-charged thorns replacing the coil rings entirely.",
      "A true conclave — the spire fully consumed by living, storm-charged bramble, current and growth inseparable.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "bramblecharge_conclave_wyldcurrent_snare",
      name: "Wyldcurrent Snare",
      description:
        "Grand Fusion capstone. Binds the target in storm-charged brambles, rooting it in place while raw current arcs through the living vines.",
      cooldownMs: 8900,
      vfxId: "vfx.lightning_nature_arcane.ability_wyldcurrent_snare",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 3000,
      bonusDamage: 34,
      damageElement: "lightning",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.lightning_nature_arcane.projectile",
  impactVfx: "vfx.lightning_nature_arcane.impact",
  idleVfx: "vfx.lightning_nature_arcane.idle",
  modelId: "tower_lightning_nature_arcane",
};

// ---------------------------------------------------------------------------
// Duplicate-parent Grand Fusions — a Twin fusion (see the "Twin" fusions
// section above) merged with a third, distinct base element instead of two
// distinct fusion elements (e.g. fire+fire, then + ice). Same `element`
// convention as every other Grand Fusion: set to the PARENT's pair (here,
// the Twin's own doubled-element string), not all 3 contributing elements.
// A curated first pass of 4 — extensible later like every other Grand
// Fusion curation pass in this file.
// ---------------------------------------------------------------------------

const fireFireIceTower: TowerDef = {
  id: "tower_fire_fire_ice",
  name: "Twinflame Geyser",
  element: "fire+fire",
  isFusion: true,
  flavorText:
    "Twin Ember's doubled inferno erupts straight through a shattered ice crown — steam blasts out scalding twice over, quenched just enough to keep it from consuming itself.",
  tiers: buildTiers(
    { damage: 40, range: 6, fireRateMs: 480, projectileSpeed: 20, splashRadius: 1.7 },
    [630, 1300, 2590],
    [1, 1.22, 1.5],
    [
      "A cracked ice crown now rings the twin cairn, steam already hissing between the flames.",
      "The crown has widened into a full vent — twin fire blasts through it in scalding double bursts.",
      "A true twinflame geyser, doubled fire and shattered ice locked in one continuous eruption.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "twinflame_geyser_double_eruption",
      name: "Double Eruption",
      description:
        "Grand Fusion capstone. Vents both flames at once through the ice crown, scalding the target with a burn far fiercer than Twin Ember's alone.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_ice.ability_double_eruption",
      statusKind: "burn",
      statusMagnitude: 12,
      statusDurationMs: 3400,
      bonusDamage: 38,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_ice.projectile",
  impactVfx: "vfx.fire_fire_ice.impact",
  idleVfx: "vfx.fire_fire_ice.idle",
  modelId: "tower_fire_fire_ice",
};

const iceIceShadowTower: TowerDef = {
  id: "tower_ice_ice_shadow",
  name: "Grieving Glacier",
  element: "ice+ice",
  isFusion: true,
  flavorText:
    "Twin Frost's fused lattice has been claimed by living shadow — every facet now weeps violet frost that curses whatever it touches.",
  tiers: buildTiers(
    { damage: 30, range: 6.3, fireRateMs: 640, projectileSpeed: 18 },
    [615, 1270, 2510],
    [1, 1.22, 1.5],
    [
      "A crack of violet shadow runs the length of the fused lattice.",
      "The shadow has spread through half the ice, weeping frost gone visibly dark.",
      "A wholly grieving glacier, every facet dark with curse-cold that never stops seeping.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "grieving_glacier_curseglass_lance",
      name: "Curseglass Lance",
      description:
        "Grand Fusion capstone. Lances the target with curse-bound ice, branding it far more severely than Twin Wraith's own curse.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_shadow.ability_curseglass_lance",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4200,
      bonusDamage: 36,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_ice_shadow.projectile",
  impactVfx: "vfx.ice_ice_shadow.impact",
  idleVfx: "vfx.ice_ice_shadow.idle",
  modelId: "tower_ice_ice_shadow",
};

const lightningLightningNatureTower: TowerDef = {
  id: "tower_lightning_lightning_nature",
  name: "Stormbramble Coil",
  element: "lightning+lightning",
  isFusion: true,
  flavorText:
    "Twin Storm's looping coil has been overtaken by living bramble — thorns conduct the doubled current now, rooting anything it strikes on contact.",
  tiers: buildTiers(
    { damage: 20, range: 6.4, fireRateMs: 260, projectileSpeed: 27, critChance: 0.28, critMultiplier: 2.1 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A single bramble vine has wound itself into the coil's loop, sparking at every thorn.",
      "The bramble has climbed the whole coil, current now visibly arcing thorn to thorn.",
      "A true stormbramble coil — doubled current running continuously through a crown of living thorn.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormbramble_coil_thornlock_surge",
      name: "Thornlock Surge",
      description:
        "Grand Fusion capstone. Roots the target in storm-charged bramble while the doubled coil's full current surges through it.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_nature.ability_thornlock_surge",
      statusKind: "root",
      statusMagnitude: 1,
      statusDurationMs: 2600,
      bonusDamage: 34,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_lightning_nature.projectile",
  impactVfx: "vfx.lightning_lightning_nature.impact",
  idleVfx: "vfx.lightning_lightning_nature.idle",
  modelId: "tower_lightning_lightning_nature",
};

const shadowShadowFireTower: TowerDef = {
  id: "tower_shadow_shadow_fire",
  name: "Cinderwraith Cairn",
  element: "shadow+shadow",
  isFusion: true,
  flavorText:
    "Twin Wraith's doubled shroud has caught fire without ever burning away — black flame licks between three watching eyes.",
  tiers: buildTiers(
    { damage: 24, range: 6, fireRateMs: 720, projectileSpeed: 17 },
    [635, 1310, 2600],
    [1, 1.22, 1.5],
    [
      "A single tongue of black fire has caught along the shroud's ragged hem.",
      "Black fire now licks across most of the shroud, all three eyes lit from within.",
      "A true cinderwraith cairn, doubled curse and black flame inseparable from one another.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "cinderwraith_cairn_blightfire_brand",
      name: "Blightfire Brand",
      description:
        "Grand Fusion capstone. Brands the target with a severe curse, then detonates it in black fire for heavy bonus damage.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_fire.ability_blightfire_brand",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4200,
      bonusDamage: 40,
      damageElement: "fire",
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.shadow_shadow_fire.projectile",
  impactVfx: "vfx.shadow_shadow_fire.impact",
  idleVfx: "vfx.shadow_shadow_fire.idle",
  modelId: "tower_shadow_shadow_fire",
};

// ---------------------------------------------------------------------------
// Non-duplicate Shadow Grand Fusions — shadow reaching the capstone tier
// through the normal (distinct-element) Grand Fusion path rather than a
// Twin parent: a shadow cross-fusion, or an existing non-shadow fusion,
// merged with a third distinct element.
// ---------------------------------------------------------------------------

const earthArcaneShadowTower: TowerDef = {
  id: "tower_earth_arcane_shadow",
  name: "Sepulcher Oracle",
  element: "earth+shadow",
  isFusion: true,
  flavorText:
    "Tombstone Warden's grave-runes have broken free of the stone entirely, drifting as arcane glyphs that read every curse laid before them.",
  tiers: buildTiers(
    { damage: 29, range: 6.5, fireRateMs: 900, projectileSpeed: 15, critChance: 0.22, critMultiplier: 2 },
    [625, 1290, 2560],
    [1, 1.22, 1.5],
    [
      "A single freed glyph orbits the cairn, faint violet light pulsing with each rotation.",
      "A full ring of glyphs now orbits the stone, each one etched with an older curse.",
      "A true sepulcher oracle — grave-stone, arcane glyph, and living curse orbiting as one.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "sepulcher_oracle_epitaph",
      name: "Epitaph",
      description:
        "Grand Fusion capstone. Reads the target's fate aloud, branding it with a severe curse and shattering its arcane defenses.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_arcane_shadow.ability_epitaph",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 34,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_arcane_shadow.projectile",
  impactVfx: "vfx.earth_arcane_shadow.impact",
  idleVfx: "vfx.earth_arcane_shadow.idle",
  modelId: "tower_earth_arcane_shadow",
};

const natureArcaneShadowTower: TowerDef = {
  id: "tower_nature_arcane_shadow",
  name: "Hollow Sanctum",
  element: "nature+arcane",
  isFusion: true,
  flavorText:
    "Druidic Sanctum's living canopy has been consumed by curse-shadow — growth and rot now orbit together in the same slow rings of rune-light.",
  tiers: buildTiers(
    { damage: 25, range: 6.6, fireRateMs: 780, projectileSpeed: 16 },
    [608, 1255, 2495],
    [1, 1.22, 1.5],
    [
      "A single dark vine has climbed into the sanctum's canopy, one glyph gone violet.",
      "Half the canopy has hollowed out, curse-light bleeding through every remaining glyph.",
      "A wholly hollow sanctum, growth and curse inseparable within its rune-lit rings.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hollow_sanctum_withered_rite",
      name: "Withered Rite",
      description:
        "Grand Fusion capstone. Brands the target with a severe curse, then chokes it in withering, curse-fed growth.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_arcane_shadow.ability_withered_rite",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 32,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_arcane_shadow.projectile",
  impactVfx: "vfx.nature_arcane_shadow.impact",
  idleVfx: "vfx.nature_arcane_shadow.idle",
  modelId: "tower_nature_arcane_shadow",
};

// ---------------------------------------------------------------------------
// Full-completion Grand Fusions — every remaining distinct-element triad
// (all 13 necessarily contain Shadow; see GrandFusionMatrix.ts's "Full
// completion pass" comment). Every fusion/grand-fusion combination in the
// game now has a real tower behind it — there is no curated subset left
// uncovered for the 35 distinct triads.
// ---------------------------------------------------------------------------

const fireIceShadowTower: TowerDef = {
  id: "tower_fire_ice_shadow",
  name: "Wraithsteam Vent",
  element: "fire+ice",
  isFusion: true,
  flavorText: "Steamcaller's geyser now breathes a curse into every cloud of vapor it vents.",
  tiers: buildTiers(
    { damage: 32, range: 6.1, fireRateMs: 560, projectileSpeed: 19, splashRadius: 1.5 },
    [625, 1290, 2560],
    [1, 1.22, 1.5],
    [
      "A hairline crack of violet has spread through the ice-crystal vent.",
      "The vent hisses in two voices now — scalding steam and something colder beneath it.",
      "A true wraithsteam vent, every jet of vapor carrying a curse out into the field.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wraithsteam_vent_cursed_scald",
      name: "Cursed Scald",
      description: "Grand Fusion capstone. Brands the target with a curse, then scalds it with cursed steam.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_ice_shadow.ability_cursed_scald",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 34,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_ice_shadow.projectile",
  impactVfx: "vfx.fire_ice_shadow.impact",
  idleVfx: "vfx.fire_ice_shadow.idle",
  modelId: "tower_fire_ice_shadow",
};

const fireLightningShadowTower: TowerDef = {
  id: "tower_fire_lightning_shadow",
  name: "Blackspark Reactor",
  element: "fire+lightning",
  isFusion: true,
  flavorText: "Plasma Arc's caged flame now discharges in bolts of living, cursed dark.",
  tiers: buildTiers(
    { damage: 26, range: 6.6, fireRateMs: 290, projectileSpeed: 27, critChance: 0.27, critMultiplier: 2.1 },
    [650, 1340, 2650],
    [1, 1.22, 1.5],
    [
      "A single black spark now crackles inside the containment rings.",
      "Black lightning has replaced half the plasma's usual glow.",
      "A true blackspark reactor, every discharge a bolt of cursed fire and current together.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "blackspark_reactor_voidbolt",
      name: "Voidbolt",
      description: "Grand Fusion capstone. Brands the target with a curse, then discharges a bolt of cursed current.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_lightning_shadow.ability_voidbolt",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 36,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.fire_lightning_shadow.projectile",
  impactVfx: "vfx.fire_lightning_shadow.impact",
  idleVfx: "vfx.fire_lightning_shadow.idle",
  modelId: "tower_fire_lightning_shadow",
};

const fireNatureShadowTower: TowerDef = {
  id: "tower_fire_nature_shadow",
  name: "Nightbloom Warden",
  element: "fire+nature",
  isFusion: true,
  flavorText: "Wildfire Warden's burning trunk has been claimed by curse-vines that only bloom at night.",
  tiers: buildTiers(
    { damage: 24, range: 6, fireRateMs: 680, projectileSpeed: 16, splashRadius: 1.4 },
    [605, 1250, 2480],
    [1, 1.22, 1.5],
    [
      "A single night-blooming flower has taken root in the burning bark.",
      "Dark blossoms now cover half the trunk, glowing faintly violet.",
      "A true nightbloom warden, every burning branch hung with curse-blossoms.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "nightbloom_warden_blightbloom",
      name: "Blightbloom",
      description: "Grand Fusion capstone. Brands the target with a curse, then bursts a night-blossom of fire over it.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_nature_shadow.ability_blightbloom",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 32,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_nature_shadow.projectile",
  impactVfx: "vfx.fire_nature_shadow.impact",
  idleVfx: "vfx.fire_nature_shadow.idle",
  modelId: "tower_fire_nature_shadow",
};

const fireEarthShadowTower: TowerDef = {
  id: "tower_fire_earth_shadow",
  name: "Duskforge Colossus",
  element: "fire+earth",
  isFusion: true,
  flavorText: "Magma Forge's molten heart now bleeds shadow through every glowing crack in the stone.",
  tiers: buildTiers(
    { damage: 36, range: 5.6, fireRateMs: 900, projectileSpeed: 14, splashRadius: 1.7 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A vein of dark has crept into the boulder's molten cracks.",
      "Half the boulder now glows violet-black between the usual fire-lit fissures.",
      "A true duskforge colossus, molten stone and living curse fused past separating.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "duskforge_colossus_ashcurse",
      name: "Ashcurse",
      description: "Grand Fusion capstone. Brands the target with a curse, then crushes it beneath cursed molten stone.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_earth_shadow.ability_ashcurse",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 38,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_earth_shadow.projectile",
  impactVfx: "vfx.fire_earth_shadow.impact",
  idleVfx: "vfx.fire_earth_shadow.idle",
  modelId: "tower_fire_earth_shadow",
};

const fireArcaneShadowTower: TowerDef = {
  id: "tower_fire_arcane_shadow",
  name: "Hexbound Sigil",
  element: "fire+arcane",
  isFusion: true,
  flavorText: "Hellfire Sigil's captive flame now burns under a hex deeper than the glyphs that bind it.",
  tiers: buildTiers(
    { damage: 28, range: 6.7, fireRateMs: 620, projectileSpeed: 18, critChance: 0.25, critMultiplier: 2.1 },
    [660, 1360, 2690],
    [1, 1.22, 1.5],
    [
      "One binding glyph has gone dark, hexed rather than merely burning.",
      "Half the sigil's glyphs now pulse violet instead of flame-orange.",
      "A true hexbound sigil, captive flame and living curse bound in the same obsidian frame.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hexbound_sigil_hexflare",
      name: "Hexflare",
      description: "Grand Fusion capstone. Brands the target with a curse, then unleashes a flare of hexed flame.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_arcane_shadow.ability_hexflare",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 33,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_arcane_shadow.projectile",
  impactVfx: "vfx.fire_arcane_shadow.impact",
  idleVfx: "vfx.fire_arcane_shadow.idle",
  modelId: "tower_fire_arcane_shadow",
};

const iceLightningShadowTower: TowerDef = {
  id: "tower_ice_lightning_shadow",
  name: "Wraithshock Shard",
  element: "ice+lightning",
  isFusion: true,
  flavorText: "Frostshock Pylon's crackling ice now channels a curse through every arc it throws.",
  tiers: buildTiers(
    { damage: 25, range: 6.5, fireRateMs: 310, projectileSpeed: 26, critChance: 0.24, critMultiplier: 2 },
    [635, 1310, 2600],
    [1, 1.22, 1.5],
    [
      "A single crack in the ice shard now sparks violet instead of white.",
      "Half the shard has gone dark, current and curse arcing together through it.",
      "A true wraithshock shard, every discharge carrying a curse into the target.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wraithshock_shard_cursed_shock",
      name: "Cursed Shock",
      description: "Grand Fusion capstone. Brands the target with a curse, then shocks it with cursed current.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_lightning_shadow.ability_cursed_shock",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 35,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.ice_lightning_shadow.projectile",
  impactVfx: "vfx.ice_lightning_shadow.impact",
  idleVfx: "vfx.ice_lightning_shadow.idle",
  modelId: "tower_ice_lightning_shadow",
};

const iceNatureShadowTower: TowerDef = {
  id: "tower_ice_nature_shadow",
  name: "Hollowfrost Grove",
  element: "ice+nature",
  isFusion: true,
  flavorText: "Permafrost Grove's frozen boughs now hold a hollow, curse-laced chill at their core.",
  tiers: buildTiers(
    { damage: 22, range: 6.4, fireRateMs: 700, projectileSpeed: 17 },
    [615, 1270, 2520],
    [1, 1.22, 1.5],
    [
      "A single frozen bough has gone hollow, violet mist curling from within.",
      "Half the grove's ice has hollowed out, hung with drifting curse-mist.",
      "A true hollowfrost grove, every frozen branch hollow and seeping living curse.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hollowfrost_grove_withering_frost",
      name: "Withering Frost",
      description: "Grand Fusion capstone. Brands the target with a curse, then withers it with hollow frost.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_nature_shadow.ability_withering_frost",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 30,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_nature_shadow.projectile",
  impactVfx: "vfx.ice_nature_shadow.impact",
  idleVfx: "vfx.ice_nature_shadow.idle",
  modelId: "tower_ice_nature_shadow",
};

const iceEarthShadowTower: TowerDef = {
  id: "tower_ice_earth_shadow",
  name: "Grave Bastion",
  element: "ice+earth",
  isFusion: true,
  flavorText: "Glacier Bastion's ice-and-rock ramparts now guard a curse buried beneath their foundations.",
  tiers: buildTiers(
    { damage: 33, range: 5.8, fireRateMs: 950, projectileSpeed: 14 },
    [655, 1350, 2670],
    [1, 1.22, 1.5],
    [
      "A single crack in the rampart glows faint violet at its base.",
      "The glow has spread through half the ramparts, ice and stone both stained dark.",
      "A true grave bastion, every slab of ice and rock guarding the curse buried within.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "grave_bastion_sepulcher_slam",
      name: "Sepulcher Slam",
      description: "Grand Fusion capstone. Brands the target with a curse, then slams it with cursed rock and ice.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_earth_shadow.ability_sepulcher_slam",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 37,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_earth_shadow.projectile",
  impactVfx: "vfx.ice_earth_shadow.impact",
  idleVfx: "vfx.ice_earth_shadow.idle",
  modelId: "tower_ice_earth_shadow",
};

const iceArcaneShadowTower: TowerDef = {
  id: "tower_ice_arcane_shadow",
  name: "Wraithweave Loom",
  element: "ice+arcane",
  isFusion: true,
  flavorText: "Frostweave Loom's rune-threads now weave living shadow through every strand of ice.",
  tiers: buildTiers(
    { damage: 24, range: 6.8, fireRateMs: 720, projectileSpeed: 18, critChance: 0.26, critMultiplier: 2.1 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A single dark thread has been woven into the reliquary's ice.",
      "Half the weave now runs violet-black, rune-light and curse-thread inseparable.",
      "A true wraithweave loom, every thread of ice and rune-light bound to a living curse.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wraithweave_loom_cursed_weave",
      name: "Cursed Weave",
      description: "Grand Fusion capstone. Brands the target with a curse, then binds it in cursed rune-thread.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_arcane_shadow.ability_cursed_weave",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 32,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_arcane_shadow.projectile",
  impactVfx: "vfx.ice_arcane_shadow.impact",
  idleVfx: "vfx.ice_arcane_shadow.idle",
  modelId: "tower_ice_arcane_shadow",
};

const lightningNatureShadowTower: TowerDef = {
  id: "tower_lightning_nature_shadow",
  name: "Nightstorm Totem",
  element: "lightning+nature",
  isFusion: true,
  flavorText: "Thornstorm Totem's living storm cloud has curdled under a curse that blots out its light.",
  tiers: buildTiers(
    { damage: 22, range: 6.6, fireRateMs: 340, projectileSpeed: 25, critChance: 0.24, critMultiplier: 1.9 },
    [625, 1290, 2560],
    [1, 1.22, 1.5],
    [
      "A single thorn on the totem sparks violet instead of white.",
      "Half the storm cloud has curdled black, thorns arcing with cursed current.",
      "A true nightstorm totem, its whole storm cloud curdled into a curse that arcs without end.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "nightstorm_totem_blightstorm",
      name: "Blightstorm",
      description: "Grand Fusion capstone. Brands the target with a curse, then lashes it with a cursed storm-thorn.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_nature_shadow.ability_blightstorm",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 31,
      damageElement: "lightning",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.lightning_nature_shadow.projectile",
  impactVfx: "vfx.lightning_nature_shadow.impact",
  idleVfx: "vfx.lightning_nature_shadow.idle",
  modelId: "tower_lightning_nature_shadow",
};

const lightningEarthShadowTower: TowerDef = {
  id: "tower_lightning_earth_shadow",
  name: "Wraithquake Coil",
  element: "lightning+earth",
  isFusion: true,
  flavorText: "Seismic Coil's fault-cracked pillar now trembles with a curse buried deep beneath the stone.",
  tiers: buildTiers(
    { damage: 30, range: 6, fireRateMs: 800, projectileSpeed: 15, splashRadius: 1.4 },
    [635, 1310, 2600],
    [1, 1.22, 1.5],
    [
      "A single fault line in the coil's pillar now glows faint violet.",
      "Half the pillar's cracks run dark, tremor and curse rising together.",
      "A true wraithquake coil, every tremor it calls down carrying a curse with it.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wraithquake_coil_cursed_tremor",
      name: "Cursed Tremor",
      description: "Grand Fusion capstone. Brands the target with a curse, then shatters the ground beneath it.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_earth_shadow.ability_cursed_tremor",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 36,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.lightning_earth_shadow.projectile",
  impactVfx: "vfx.lightning_earth_shadow.impact",
  idleVfx: "vfx.lightning_earth_shadow.idle",
  modelId: "tower_lightning_earth_shadow",
};

const lightningArcaneShadowTower: TowerDef = {
  id: "tower_lightning_arcane_shadow",
  name: "Hexflux Spire",
  element: "lightning+arcane",
  isFusion: true,
  flavorText: "Arcflux Spire's charged conduit now hums with a hex deeper than its own current.",
  tiers: buildTiers(
    { damage: 24, range: 6.9, fireRateMs: 280, projectileSpeed: 28, critChance: 0.28, critMultiplier: 2.2 },
    [655, 1350, 2670],
    [1, 1.22, 1.5],
    [
      "A single coil on the spire hums violet instead of blue-white.",
      "Half the conduit now channels a hex alongside its usual current.",
      "A true hexflux spire, every discharge a hex given form as lightning.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hexflux_spire_hexcharge",
      name: "Hexcharge",
      description: "Grand Fusion capstone. Brands the target with a curse, then overcharges it with hexed current.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_arcane_shadow.ability_hexcharge",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 33,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_arcane_shadow.projectile",
  impactVfx: "vfx.lightning_arcane_shadow.impact",
  idleVfx: "vfx.lightning_arcane_shadow.idle",
  modelId: "tower_lightning_arcane_shadow",
};

const natureEarthShadowTower: TowerDef = {
  id: "tower_nature_earth_shadow",
  name: "Rootgrave Colossus",
  element: "nature+earth",
  isFusion: true,
  flavorText: "Overgrowth Colossus's moss-bound cracks now seep a curse up from whatever it's rooted in.",
  tiers: buildTiers(
    { damage: 27, range: 5.9, fireRateMs: 850, projectileSpeed: 14, splashRadius: 1.5 },
    [620, 1280, 2540],
    [1, 1.22, 1.5],
    [
      "A single root has cracked through the boulder totem, weeping faint violet sap.",
      "Half the moss has gone pale and grey, curse-sap running through every crack.",
      "A true rootgrave colossus, moss and stone and buried curse grown into one being.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "rootgrave_colossus_grave_bloom",
      name: "Grave Bloom",
      description: "Grand Fusion capstone. Brands the target with a curse, then roots it in cursed growth.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_earth_shadow.ability_grave_bloom",
      statusKind: "curse",
      statusMagnitude: 0.4,
      statusDurationMs: 4000,
      bonusDamage: 30,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_earth_shadow.projectile",
  impactVfx: "vfx.nature_earth_shadow.impact",
  idleVfx: "vfx.nature_earth_shadow.idle",
  modelId: "tower_nature_earth_shadow",
};

// ---------------------------------------------------------------------------
// Duplicate-parent Grand Fusion completion, batch 1 — every remaining
// fire+fire+Y and ice+ice+Y (Twin Ember / Twin Frost as parent). Unlike the
// distinct-triad batch above, these carry the TWIN's own doubled signature
// status (burn for fire, chill for ice) rather than curse by default — the
// point of a Twin capstone is "more of the same, harder", same as Twin
// Ember/Twin Frost themselves — except when the third element is Shadow,
// where curse takes over as the more thematically apt capstone identity.
// ---------------------------------------------------------------------------

const fireFireLightningTower: TowerDef = {
  id: "tower_fire_fire_lightning",
  name: "Emberstorm Core",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Twin Ember's doubled inferno now conducts raw lightning through every guttering coal.",
  tiers: buildTiers(
    { damage: 44, range: 6.2, fireRateMs: 440, projectileSpeed: 22, splashRadius: 1.7 },
    [620, 1280, 2550],
    [1, 1.22, 1.5],
    [
      "A single arc of lightning now leaps between the cairn's twin flames.",
      "Lightning courses continuously between both flames, embers snapping with every arc.",
      "A true emberstorm core, doubled fire and raw current locked in one violent cycle.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "emberstorm_core_stormignite",
      name: "Stormignite",
      description: "Grand Fusion capstone. Sets the target ablaze with a fiercer burn, then arcs lightning through the flame.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_lightning.ability_stormignite",
      statusKind: "burn",
      statusMagnitude: 13,
      statusDurationMs: 3400,
      bonusDamage: 36,
      damageElement: "lightning",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_lightning.projectile",
  impactVfx: "vfx.fire_fire_lightning.impact",
  idleVfx: "vfx.fire_fire_lightning.idle",
  modelId: "tower_fire_fire_lightning",
};

const fireFireNatureTower: TowerDef = {
  id: "tower_fire_fire_nature",
  name: "Wildember Colossus",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Twin Ember's doubled blaze has grown a living canopy that burns without ever being consumed.",
  tiers: buildTiers(
    { damage: 38, range: 5.9, fireRateMs: 620, projectileSpeed: 17, splashRadius: 1.8 },
    [605, 1250, 2480],
    [1, 1.22, 1.5],
    [
      "A single burning vine has taken root at the twin cairn's base.",
      "Living, burning growth now wreathes both flames entirely.",
      "A true wildember colossus, doubled fire sustaining a canopy that never stops growing or burning.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wildember_colossus_wildfire_ignite",
      name: "Wildfire Ignite",
      description: "Grand Fusion capstone. Sets the target ablaze with a fiercer burn that spreads like wildfire.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_nature.ability_wildfire_ignite",
      statusKind: "burn",
      statusMagnitude: 13,
      statusDurationMs: 3400,
      bonusDamage: 32,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_nature.projectile",
  impactVfx: "vfx.fire_fire_nature.impact",
  idleVfx: "vfx.fire_fire_nature.idle",
  modelId: "tower_fire_fire_nature",
};

const fireFireEarthTower: TowerDef = {
  id: "tower_fire_fire_earth",
  name: "Emberquake Cairn",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Twin Ember's doubled fire has fused the whole cairn into a single mass of molten rock.",
  tiers: buildTiers(
    { damage: 48, range: 5.6, fireRateMs: 780, projectileSpeed: 15, splashRadius: 1.9 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A crack of molten rock has opened between the cairn's twin flames.",
      "Half the cairn now glows molten, fire and stone barely distinguishable.",
      "A true emberquake cairn, doubled fire and living rock fused into one molten mass.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "emberquake_cairn_moltenburst",
      name: "Moltenburst",
      description: "Grand Fusion capstone. Sets the target ablaze with a fiercer burn, then erupts molten rock beneath it.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_earth.ability_moltenburst",
      statusKind: "burn",
      statusMagnitude: 13,
      statusDurationMs: 3400,
      bonusDamage: 40,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_earth.projectile",
  impactVfx: "vfx.fire_fire_earth.impact",
  idleVfx: "vfx.fire_fire_earth.idle",
  modelId: "tower_fire_fire_earth",
};

const fireFireArcaneTower: TowerDef = {
  id: "tower_fire_fire_arcane",
  name: "Emberglyph Reactor",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Twin Ember's doubled blaze now burns within a ring of binding glyphs that feed it back on itself.",
  tiers: buildTiers(
    { damage: 36, range: 6.4, fireRateMs: 560, projectileSpeed: 19, critChance: 0.26, critMultiplier: 2.1 },
    [660, 1360, 2690],
    [1, 1.22, 1.5],
    [
      "A single glyph now orbits the twin cairn, flame licking at its edge.",
      "A full ring of glyphs orbits both flames, feeding the fire back on itself.",
      "A true emberglyph reactor, doubled fire sustained in an endless glyph-bound cycle.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "emberglyph_reactor_glyphburn",
      name: "Glyphburn",
      description: "Grand Fusion capstone. Sets the target ablaze with a fiercer burn empowered by binding glyphs.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_arcane.ability_glyphburn",
      statusKind: "burn",
      statusMagnitude: 13,
      statusDurationMs: 3400,
      bonusDamage: 34,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_arcane.projectile",
  impactVfx: "vfx.fire_fire_arcane.impact",
  idleVfx: "vfx.fire_fire_arcane.idle",
  modelId: "tower_fire_fire_arcane",
};

const fireFireShadowTower: TowerDef = {
  id: "tower_fire_fire_shadow",
  name: "Doubleflame Wraith",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Twin Ember's doubled blaze now burns with a curse instead of ordinary heat.",
  tiers: buildTiers(
    { damage: 34, range: 6, fireRateMs: 600, projectileSpeed: 18, splashRadius: 1.5 },
    [640, 1320, 2620],
    [1, 1.22, 1.5],
    [
      "A single tongue of both flames has gone black, curse instead of heat.",
      "Half the cairn's fire now burns black, curse-light bleeding from every ember.",
      "A true doubleflame wraith, both flames burning entirely as living, cursed dark fire.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "doubleflame_wraith_black_ignite",
      name: "Black Ignite",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then ignites it with black fire.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_shadow.ability_black_ignite",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 38,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_shadow.projectile",
  impactVfx: "vfx.fire_fire_shadow.impact",
  idleVfx: "vfx.fire_fire_shadow.idle",
  modelId: "tower_fire_fire_shadow",
};

const iceIceFireTower: TowerDef = {
  id: "tower_ice_ice_fire",
  name: "Frostfire Twin",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Twin Frost's fused lattice now radiates a trapped fire, burning cold and hot in the same breath.",
  tiers: buildTiers(
    { damage: 32, range: 6.5, fireRateMs: 500, projectileSpeed: 22, splashRadius: 1.3 },
    [610, 1260, 2500],
    [1, 1.22, 1.5],
    [
      "A single ember glows trapped inside the fused ice lattice.",
      "The trapped fire has spread through half the lattice, ice hissing where it burns.",
      "A true frostfire twin, an unquenched flame burning permanently at the heart of the ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frostfire_twin_deeper_chill",
      name: "Deeper Chill",
      description: "Grand Fusion capstone. Chills the target far harder than Twin Frost alone, then sears it with trapped fire.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_fire.ability_deeper_chill",
      statusKind: "chill",
      statusMagnitude: 0.55,
      statusDurationMs: 2600,
      bonusDamage: 34,
      damageElement: "fire",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_ice_fire.projectile",
  impactVfx: "vfx.ice_ice_fire.impact",
  idleVfx: "vfx.ice_ice_fire.idle",
  modelId: "tower_ice_ice_fire",
};

const iceIceLightningTower: TowerDef = {
  id: "tower_ice_ice_lightning",
  name: "Frostshock Twin",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Twin Frost's fused lattice now crackles with lightning trapped between its facets.",
  tiers: buildTiers(
    { damage: 26, range: 6.7, fireRateMs: 340, projectileSpeed: 27, critChance: 0.26, critMultiplier: 2.1 },
    [615, 1270, 2520],
    [1, 1.22, 1.5],
    [
      "A single spark now leaps between the fused lattice's facets.",
      "Lightning courses continuously through half the lattice, ice ringing with every arc.",
      "A true frostshock twin, doubled cold and raw current locked in the same crystal lattice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frostshock_twin_deeper_chill",
      name: "Deeper Chill",
      description: "Grand Fusion capstone. Chills the target far harder than Twin Frost alone, then shocks it with trapped current.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_lightning.ability_deeper_chill",
      statusKind: "chill",
      statusMagnitude: 0.55,
      statusDurationMs: 2600,
      bonusDamage: 32,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.ice_ice_lightning.projectile",
  impactVfx: "vfx.ice_ice_lightning.impact",
  idleVfx: "vfx.ice_ice_lightning.idle",
  modelId: "tower_ice_ice_lightning",
};

const iceIceNatureTower: TowerDef = {
  id: "tower_ice_ice_nature",
  name: "Permafrost Twin",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Twin Frost's fused lattice has grown a canopy of its own, frozen mid-growth and never thawing.",
  tiers: buildTiers(
    { damage: 24, range: 6.6, fireRateMs: 640, projectileSpeed: 18 },
    [600, 1240, 2460],
    [1, 1.22, 1.5],
    [
      "A single frozen branch has grown from the fused lattice.",
      "A full frozen canopy now crowns the lattice, never thawing.",
      "A true permafrost twin, ice and living growth locked together in eternal winter.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "permafrost_twin_deeper_chill",
      name: "Deeper Chill",
      description: "Grand Fusion capstone. Chills the target far harder than Twin Frost alone, then poisons it with frozen sap.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_nature.ability_deeper_chill",
      statusKind: "chill",
      statusMagnitude: 0.55,
      statusDurationMs: 2600,
      bonusDamage: 28,
      damageElement: "nature",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_ice_nature.projectile",
  impactVfx: "vfx.ice_ice_nature.impact",
  idleVfx: "vfx.ice_ice_nature.idle",
  modelId: "tower_ice_ice_nature",
};

const iceIceEarthTower: TowerDef = {
  id: "tower_ice_ice_earth",
  name: "Glacial Twin Bastion",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Twin Frost's fused lattice has grown into solid stone, an unmoving glacier given ramparts.",
  tiers: buildTiers(
    { damage: 30, range: 6.1, fireRateMs: 850, projectileSpeed: 14 },
    [635, 1310, 2600],
    [1, 1.22, 1.5],
    [
      "A single vein of stone has crept into the fused ice lattice.",
      "Half the lattice has fused with rock, an immovable glacial wall taking shape.",
      "A true glacial twin bastion, doubled ice and living rock fused into one unmoving rampart.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "glacial_twin_bastion_deeper_chill",
      name: "Deeper Chill",
      description: "Grand Fusion capstone. Chills the target far harder than Twin Frost alone, then crushes it beneath glacial stone.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_earth.ability_deeper_chill",
      statusKind: "chill",
      statusMagnitude: 0.55,
      statusDurationMs: 2600,
      bonusDamage: 36,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_ice_earth.projectile",
  impactVfx: "vfx.ice_ice_earth.impact",
  idleVfx: "vfx.ice_ice_earth.idle",
  modelId: "tower_ice_ice_earth",
};

const iceIceArcaneTower: TowerDef = {
  id: "tower_ice_ice_arcane",
  name: "Frostrune Twin",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Twin Frost's fused lattice now hums with binding rune-light woven through every facet.",
  tiers: buildTiers(
    { damage: 26, range: 6.9, fireRateMs: 660, projectileSpeed: 19, critChance: 0.27, critMultiplier: 2.2 },
    [650, 1340, 2650],
    [1, 1.22, 1.5],
    [
      "A single rune now glows faintly within the fused lattice.",
      "A full ring of runes orbits the lattice, ice and rune-light woven together.",
      "A true frostrune twin, doubled ice bound permanently to a halo of living rune-light.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "frostrune_twin_deeper_chill",
      name: "Deeper Chill",
      description: "Grand Fusion capstone. Chills the target far harder than Twin Frost alone, then lances it with rune-bound force.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_arcane.ability_deeper_chill",
      statusKind: "chill",
      statusMagnitude: 0.55,
      statusDurationMs: 2600,
      bonusDamage: 30,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.ice_ice_arcane.projectile",
  impactVfx: "vfx.ice_ice_arcane.impact",
  idleVfx: "vfx.ice_ice_arcane.idle",
  modelId: "tower_ice_ice_arcane",
};

// ---------------------------------------------------------------------------
// Duplicate-parent Grand Fusion completion, batch 2 — every remaining
// lightning+lightning+Y and nature+nature+Y (Twin Storm / Twin Thorn as
// parent). Same convention as batch 1: the Twin's own doubled signature
// status carries over (shock for lightning, poison for nature), except
// when Shadow is the third element, where curse takes over.
// ---------------------------------------------------------------------------

const lightningLightningFireTower: TowerDef = {
  id: "tower_lightning_lightning_fire",
  name: "Stormforge Twin",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Twin Storm's looping coil now channels raw fire between every arc it throws.",
  tiers: buildTiers(
    { damage: 22, range: 6.6, fireRateMs: 260, projectileSpeed: 28, critChance: 0.26, critMultiplier: 2.1 },
    [655, 1350, 2670],
    [1, 1.22, 1.5],
    [
      "A single ember now rides the current looping between the twin masts.",
      "Fire and lightning course together through half the coil's loop.",
      "A true stormforge twin, doubled current and raw fire fused into one violent cycle.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormforge_twin_deeper_overcharge",
      name: "Deeper Overcharge",
      description: "Grand Fusion capstone. Overcharges the target far harder than Twin Storm alone, then sears it with forge-fire.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_fire.ability_deeper_overcharge",
      statusKind: "shock",
      statusMagnitude: 0.85,
      statusDurationMs: 1200,
      bonusDamage: 34,
      damageElement: "fire",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_lightning_fire.projectile",
  impactVfx: "vfx.lightning_lightning_fire.impact",
  idleVfx: "vfx.lightning_lightning_fire.idle",
  modelId: "tower_lightning_lightning_fire",
};

const lightningLightningIceTower: TowerDef = {
  id: "tower_lightning_lightning_ice",
  name: "Stormglass Twin",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Twin Storm's coil has crystallized mid-arc into living shards of ice-veined lightning.",
  tiers: buildTiers(
    { damage: 20, range: 6.7, fireRateMs: 280, projectileSpeed: 29, critChance: 0.28, critMultiplier: 2.2 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A single shard of ice has crystallized along the coil's arc.",
      "Half the coil now arcs through crystalline ice instead of open air.",
      "A true stormglass twin, doubled current locked permanently inside living ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormglass_twin_deeper_overcharge",
      name: "Deeper Overcharge",
      description: "Grand Fusion capstone. Overcharges the target far harder than Twin Storm alone, then lances it with ice-veined current.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_ice.ability_deeper_overcharge",
      statusKind: "shock",
      statusMagnitude: 0.85,
      statusDurationMs: 1200,
      bonusDamage: 30,
      damageElement: "ice",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_lightning_ice.projectile",
  impactVfx: "vfx.lightning_lightning_ice.impact",
  idleVfx: "vfx.lightning_lightning_ice.idle",
  modelId: "tower_lightning_lightning_ice",
};

const lightningLightningEarthTower: TowerDef = {
  id: "tower_lightning_lightning_earth",
  name: "Fulgurite Twin",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Twin Storm's doubled strikes have fused the ground beneath it into glassy fulgurite.",
  tiers: buildTiers(
    { damage: 26, range: 6.2, fireRateMs: 380, projectileSpeed: 24, splashRadius: 1.3 },
    [660, 1360, 2690],
    [1, 1.22, 1.5],
    [
      "A vein of glassy fulgurite has formed at the twin masts' base.",
      "Half the ground beneath the coil has fused to glass, current arcing through it.",
      "A true fulgurite twin, doubled lightning locked forever inside its own glassy stone.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "fulgurite_twin_deeper_overcharge",
      name: "Deeper Overcharge",
      description: "Grand Fusion capstone. Overcharges the target far harder than Twin Storm alone, then shatters glassy stone over it.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_earth.ability_deeper_overcharge",
      statusKind: "shock",
      statusMagnitude: 0.85,
      statusDurationMs: 1200,
      bonusDamage: 38,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.lightning_lightning_earth.projectile",
  impactVfx: "vfx.lightning_lightning_earth.impact",
  idleVfx: "vfx.lightning_lightning_earth.idle",
  modelId: "tower_lightning_lightning_earth",
};

const lightningLightningArcaneTower: TowerDef = {
  id: "tower_lightning_lightning_arcane",
  name: "Stormrune Twin",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Twin Storm's coil now hums with binding rune-light between every arc it throws.",
  tiers: buildTiers(
    { damage: 21, range: 6.9, fireRateMs: 300, projectileSpeed: 27, critChance: 0.3, critMultiplier: 2.3 },
    [665, 1370, 2710],
    [1, 1.22, 1.5],
    [
      "A single rune now glows where the twin masts' currents meet.",
      "A full ring of runes now channels current between both masts.",
      "A true stormrune twin, doubled lightning bound permanently to a halo of rune-light.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormrune_twin_deeper_overcharge",
      name: "Deeper Overcharge",
      description: "Grand Fusion capstone. Overcharges the target far harder than Twin Storm alone, then lances it with rune-bound force.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_arcane.ability_deeper_overcharge",
      statusKind: "shock",
      statusMagnitude: 0.85,
      statusDurationMs: 1200,
      bonusDamage: 32,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.lightning_lightning_arcane.projectile",
  impactVfx: "vfx.lightning_lightning_arcane.impact",
  idleVfx: "vfx.lightning_lightning_arcane.idle",
  modelId: "tower_lightning_lightning_arcane",
};

const lightningLightningShadowTower: TowerDef = {
  id: "tower_lightning_lightning_shadow",
  name: "Voidstorm Twin",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Twin Storm's current has curdled into a curse that arcs endlessly between both masts.",
  tiers: buildTiers(
    { damage: 19, range: 6.5, fireRateMs: 320, projectileSpeed: 26, critChance: 0.25, critMultiplier: 2 },
    [650, 1340, 2650],
    [1, 1.22, 1.5],
    [
      "A single arc between the masts now crackles violet instead of white.",
      "Half the coil's current has curdled black, curse and lightning arcing together.",
      "A true voidstorm twin, doubled current given over entirely to a living curse.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "voidstorm_twin_cursed_overcharge",
      name: "Cursed Overcharge",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then overcharges it with cursed current.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_shadow.ability_cursed_overcharge",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 33,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_lightning_shadow.projectile",
  impactVfx: "vfx.lightning_lightning_shadow.impact",
  idleVfx: "vfx.lightning_lightning_shadow.idle",
  modelId: "tower_lightning_lightning_shadow",
};

const natureNatureFireTower: TowerDef = {
  id: "tower_nature_nature_fire",
  name: "Wildthorn Pyre",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's doubled canopy now burns without ever being consumed by the flame.",
  tiers: buildTiers(
    { damage: 26, range: 6, fireRateMs: 600, projectileSpeed: 17, splashRadius: 1.4 },
    [610, 1260, 2500],
    [1, 1.22, 1.5],
    [
      "A single burning thorn has taken hold on the doubled trunk.",
      "Fire now licks along half the canopy without consuming a single leaf.",
      "A true wildthorn pyre, doubled growth and eternal flame sustaining each other.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wildthorn_pyre_deeper_venom",
      name: "Deeper Venom",
      description: "Grand Fusion capstone. Poisons the target far more virulently than Twin Thorn alone, then sears it with wild fire.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_fire.ability_deeper_venom",
      statusKind: "poison",
      statusMagnitude: 9,
      statusDurationMs: 3800,
      bonusDamage: 32,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_nature_fire.projectile",
  impactVfx: "vfx.nature_nature_fire.impact",
  idleVfx: "vfx.nature_nature_fire.idle",
  modelId: "tower_nature_nature_fire",
};

const natureNatureIceTower: TowerDef = {
  id: "tower_nature_nature_ice",
  name: "Rimethorn Twin",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's doubled canopy has frozen mid-growth, every thorn sheathed in ice.",
  tiers: buildTiers(
    { damage: 20, range: 6.1, fireRateMs: 660, projectileSpeed: 17 },
    [600, 1240, 2460],
    [1, 1.22, 1.5],
    [
      "A single frozen thorn now glints among the doubled canopy.",
      "Ice sheathes half the canopy's thorns, growth frozen mid-motion.",
      "A true rimethorn twin, doubled growth locked forever in a crown of ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "rimethorn_twin_deeper_venom",
      name: "Deeper Venom",
      description: "Grand Fusion capstone. Poisons the target far more virulently than Twin Thorn alone, then chills it to the bone.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_ice.ability_deeper_venom",
      statusKind: "poison",
      statusMagnitude: 9,
      statusDurationMs: 3800,
      bonusDamage: 28,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.nature_nature_ice.projectile",
  impactVfx: "vfx.nature_nature_ice.impact",
  idleVfx: "vfx.nature_nature_ice.idle",
  modelId: "tower_nature_nature_ice",
};

const natureNatureLightningTower: TowerDef = {
  id: "tower_nature_nature_lightning",
  name: "Stormthorn Twin",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's doubled canopy now crackles with lightning between every thorn.",
  tiers: buildTiers(
    { damage: 19, range: 6.4, fireRateMs: 420, projectileSpeed: 22, critChance: 0.24, critMultiplier: 1.9 },
    [630, 1300, 2580],
    [1, 1.22, 1.5],
    [
      "A single spark now leaps between two thorns on the doubled canopy.",
      "Lightning courses continuously through half the canopy's thorns.",
      "A true stormthorn twin, doubled growth and raw current fused into one living storm.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "stormthorn_twin_deeper_venom",
      name: "Deeper Venom",
      description: "Grand Fusion capstone. Poisons the target far more virulently than Twin Thorn alone, then shocks it with thorn-bound current.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_lightning.ability_deeper_venom",
      statusKind: "poison",
      statusMagnitude: 9,
      statusDurationMs: 3800,
      bonusDamage: 30,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.nature_nature_lightning.projectile",
  impactVfx: "vfx.nature_nature_lightning.impact",
  idleVfx: "vfx.nature_nature_lightning.idle",
  modelId: "tower_nature_nature_lightning",
};

const natureNatureEarthTower: TowerDef = {
  id: "tower_nature_nature_earth",
  name: "Rootthorn Colossus",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's roots have fused with stone into a colossus of living wood and rock.",
  tiers: buildTiers(
    { damage: 30, range: 5.8, fireRateMs: 780, projectileSpeed: 15, splashRadius: 1.5 },
    [625, 1290, 2560],
    [1, 1.22, 1.5],
    [
      "A single root has cracked through stone at the doubled trunk's base.",
      "Half the trunk has fused with rock, roots running deep through stone.",
      "A true rootthorn colossus, doubled growth and living rock grown into one being.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "rootthorn_colossus_deeper_venom",
      name: "Deeper Venom",
      description: "Grand Fusion capstone. Poisons the target far more virulently than Twin Thorn alone, then crushes it beneath living stone.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_earth.ability_deeper_venom",
      statusKind: "poison",
      statusMagnitude: 9,
      statusDurationMs: 3800,
      bonusDamage: 36,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_nature_earth.projectile",
  impactVfx: "vfx.nature_nature_earth.impact",
  idleVfx: "vfx.nature_nature_earth.idle",
  modelId: "tower_nature_nature_earth",
};

const natureNatureArcaneTower: TowerDef = {
  id: "tower_nature_nature_arcane",
  name: "Runethorn Twin",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's doubled canopy now hums with binding rune-light woven through every branch.",
  tiers: buildTiers(
    { damage: 21, range: 6.6, fireRateMs: 700, projectileSpeed: 18, critChance: 0.25, critMultiplier: 2 },
    [635, 1310, 2600],
    [1, 1.22, 1.5],
    [
      "A single rune now glows among the doubled canopy's branches.",
      "A full ring of runes orbits the canopy, growth and rune-light woven together.",
      "A true runethorn twin, doubled growth bound permanently to a halo of living rune-light.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "runethorn_twin_deeper_venom",
      name: "Deeper Venom",
      description: "Grand Fusion capstone. Poisons the target far more virulently than Twin Thorn alone, then lances it with rune-bound force.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_arcane.ability_deeper_venom",
      statusKind: "poison",
      statusMagnitude: 9,
      statusDurationMs: 3800,
      bonusDamage: 29,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_nature_arcane.projectile",
  impactVfx: "vfx.nature_nature_arcane.impact",
  idleVfx: "vfx.nature_nature_arcane.idle",
  modelId: "tower_nature_nature_arcane",
};

const natureNatureShadowTower: TowerDef = {
  id: "tower_nature_nature_shadow",
  name: "Blightthorn Twin",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's doubled growth has curdled into a bramble that carries a curse in every thorn.",
  tiers: buildTiers(
    { damage: 22, range: 6, fireRateMs: 660, projectileSpeed: 16 },
    [620, 1280, 2540],
    [1, 1.22, 1.5],
    [
      "A single thorn on the doubled canopy has gone black and withered.",
      "Half the canopy has withered to grey, thorns dark with an old curse.",
      "A true blightthorn twin, doubled growth wholly given over to living curse and rot.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "blightthorn_twin_cursed_venom",
      name: "Cursed Venom",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then poisons it with withering venom.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_shadow.ability_cursed_venom",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 30,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_nature_shadow.projectile",
  impactVfx: "vfx.nature_nature_shadow.impact",
  idleVfx: "vfx.nature_nature_shadow.idle",
  modelId: "tower_nature_nature_shadow",
};

// ---------------------------------------------------------------------------
// Duplicate-parent Grand Fusion completion, batch 3 — every earth+earth+Y
// and arcane+arcane+Y (Twin Stone / Twin Rune as parent). Same convention:
// the Twin's own doubled signature status carries over (sunder for earth,
// silence for arcane), except when Shadow is third, where curse takes over.
// ---------------------------------------------------------------------------

const earthEarthFireTower: TowerDef = {
  id: "tower_earth_earth_fire",
  name: "Magma Twin Colossus",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn has grown a molten heart, glowing between every crack in the stone.",
  tiers: buildTiers(
    { damage: 42, range: 5.5, fireRateMs: 950, projectileSpeed: 14, splashRadius: 1.9 },
    [640, 1320, 2620],
    [1, 1.22, 1.5],
    [
      "A single crack in the fused cairn now glows with trapped molten rock.",
      "Half the cairn now glows molten, fire seeping through every fissure.",
      "A true magma twin colossus, doubled stone and molten fire fused into one immense being.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "magma_twin_colossus_deeper_sunder",
      name: "Deeper Sunder",
      description: "Grand Fusion capstone. Cracks far more of the target's armor away than Twin Stone alone, then sears it with molten rock.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_fire.ability_deeper_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.4,
      statusDurationMs: 3800,
      bonusDamage: 38,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_fire.projectile",
  impactVfx: "vfx.earth_earth_fire.impact",
  idleVfx: "vfx.earth_earth_fire.idle",
  modelId: "tower_earth_earth_fire",
};

const earthEarthIceTower: TowerDef = {
  id: "tower_earth_earth_ice",
  name: "Glacial Twin Cairn",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn has frozen solid, ice binding every crack in the stone shut.",
  tiers: buildTiers(
    { damage: 36, range: 5.7, fireRateMs: 1000, projectileSpeed: 13 },
    [630, 1300, 2580],
    [1, 1.22, 1.5],
    [
      "A single crack in the fused cairn now glitters with ice.",
      "Half the cairn has iced over, stone and frost fused together.",
      "A true glacial twin cairn, doubled stone entirely encased in unmelting ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "glacial_twin_cairn_deeper_sunder",
      name: "Deeper Sunder",
      description: "Grand Fusion capstone. Cracks far more of the target's armor away than Twin Stone alone, then chills it to the bone.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_ice.ability_deeper_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.4,
      statusDurationMs: 3800,
      bonusDamage: 33,
      damageElement: "ice",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_ice.projectile",
  impactVfx: "vfx.earth_earth_ice.impact",
  idleVfx: "vfx.earth_earth_ice.idle",
  modelId: "tower_earth_earth_ice",
};

const earthEarthLightningTower: TowerDef = {
  id: "tower_earth_earth_lightning",
  name: "Fulgurite Colossus",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn now channels lightning through veins of glassy fulgurite.",
  tiers: buildTiers(
    { damage: 34, range: 5.9, fireRateMs: 880, projectileSpeed: 15, splashRadius: 1.4 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A single vein of glassy fulgurite has formed in the fused cairn.",
      "Half the cairn is threaded with fulgurite, current arcing through the stone.",
      "A true fulgurite colossus, doubled stone permanently charged with captive lightning.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "fulgurite_colossus_deeper_sunder",
      name: "Deeper Sunder",
      description: "Grand Fusion capstone. Cracks far more of the target's armor away than Twin Stone alone, then shocks it with current locked in stone.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_lightning.ability_deeper_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.4,
      statusDurationMs: 3800,
      bonusDamage: 35,
      damageElement: "lightning",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_lightning.projectile",
  impactVfx: "vfx.earth_earth_lightning.impact",
  idleVfx: "vfx.earth_earth_lightning.idle",
  modelId: "tower_earth_earth_lightning",
};

const earthEarthNatureTower: TowerDef = {
  id: "tower_earth_earth_nature",
  name: "Overgrown Twin Cairn",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn has been reclaimed entirely by moss and root, stone barely visible beneath the growth.",
  tiers: buildTiers(
    { damage: 32, range: 5.6, fireRateMs: 920, projectileSpeed: 14, splashRadius: 1.6 },
    [618, 1275, 2530],
    [1, 1.22, 1.5],
    [
      "A single vine has taken root in the fused cairn's stone.",
      "Half the cairn now wears a thick coat of moss and living root.",
      "A true overgrown twin cairn, doubled stone and living growth grown into one being.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "overgrown_twin_cairn_deeper_sunder",
      name: "Deeper Sunder",
      description: "Grand Fusion capstone. Cracks far more of the target's armor away than Twin Stone alone, then poisons it with root-sap.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_nature.ability_deeper_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.4,
      statusDurationMs: 3800,
      bonusDamage: 31,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_nature.projectile",
  impactVfx: "vfx.earth_earth_nature.impact",
  idleVfx: "vfx.earth_earth_nature.idle",
  modelId: "tower_earth_earth_nature",
};

const earthEarthArcaneTower: TowerDef = {
  id: "tower_earth_earth_arcane",
  name: "Runestone Colossus",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn now hums with binding rune-light etched deep into every boulder.",
  tiers: buildTiers(
    { damage: 33, range: 6, fireRateMs: 940, projectileSpeed: 15, critChance: 0.2, critMultiplier: 2 },
    [650, 1340, 2650],
    [1, 1.22, 1.5],
    [
      "A single rune has been etched into the fused cairn's face.",
      "Runes now cover half the cairn, glowing faintly with bound force.",
      "A true runestone colossus, doubled stone entirely inscribed with binding rune-light.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "runestone_colossus_deeper_sunder",
      name: "Deeper Sunder",
      description: "Grand Fusion capstone. Cracks far more of the target's armor away than Twin Stone alone, then lances it with rune-bound force.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_arcane.ability_deeper_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.4,
      statusDurationMs: 3800,
      bonusDamage: 32,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_arcane.projectile",
  impactVfx: "vfx.earth_earth_arcane.impact",
  idleVfx: "vfx.earth_earth_arcane.idle",
  modelId: "tower_earth_earth_arcane",
};

const earthEarthShadowTower: TowerDef = {
  id: "tower_earth_earth_shadow",
  name: "Tombstone Twin",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn has become a grave marker for a curse buried deep beneath it.",
  tiers: buildTiers(
    { damage: 35, range: 5.5, fireRateMs: 980, projectileSpeed: 13 },
    [635, 1310, 2600],
    [1, 1.22, 1.5],
    [
      "A single rune on the fused cairn now glows an unsettling violet.",
      "Half the cairn has darkened, curse-light bleeding from every crack.",
      "A true tombstone twin, doubled stone standing eternal watch over the curse it guards.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "tombstone_twin_cursed_crush",
      name: "Cursed Crush",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then crushes it beneath cursed stone.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_shadow.ability_cursed_crush",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 39,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_shadow.projectile",
  impactVfx: "vfx.earth_earth_shadow.impact",
  idleVfx: "vfx.earth_earth_shadow.idle",
  modelId: "tower_earth_earth_shadow",
};

const arcaneArcaneFireTower: TowerDef = {
  id: "tower_arcane_arcane_fire",
  name: "Hexforge Twin",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo now channels a captive flame between every one of its rings.",
  tiers: buildTiers(
    { damage: 24, range: 6.7, fireRateMs: 760, projectileSpeed: 18, critChance: 0.28, critMultiplier: 2.3 },
    [665, 1370, 2710],
    [1, 1.22, 1.5],
    [
      "A single flame now flickers within the merged glyph-halo.",
      "Fire courses continuously through half the halo's rings.",
      "A true hexforge twin, doubled rune-light sustaining an eternal captive flame.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hexforge_twin_deeper_silence",
      name: "Deeper Silence",
      description: "Grand Fusion capstone. Suppresses the target's abilities far longer than Twin Rune alone, then sears it with captive fire.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_fire.ability_deeper_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2600,
      bonusDamage: 35,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_arcane_fire.projectile",
  impactVfx: "vfx.arcane_arcane_fire.impact",
  idleVfx: "vfx.arcane_arcane_fire.idle",
  modelId: "tower_arcane_arcane_fire",
};

const arcaneArcaneIceTower: TowerDef = {
  id: "tower_arcane_arcane_ice",
  name: "Runeglass Twin",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo has crystallized into rings of living ice, rune-light frozen mid-glow.",
  tiers: buildTiers(
    { damage: 22, range: 6.9, fireRateMs: 800, projectileSpeed: 19, critChance: 0.28, critMultiplier: 2.3 },
    [655, 1350, 2670],
    [1, 1.22, 1.5],
    [
      "A single ring of the merged halo has crystallized to ice.",
      "Half the halo now glitters with frozen rune-light.",
      "A true runeglass twin, doubled rune-light locked forever inside living ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "runeglass_twin_deeper_silence",
      name: "Deeper Silence",
      description: "Grand Fusion capstone. Suppresses the target's abilities far longer than Twin Rune alone, then chills it to the bone.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_ice.ability_deeper_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2600,
      bonusDamage: 31,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.arcane_arcane_ice.projectile",
  impactVfx: "vfx.arcane_arcane_ice.impact",
  idleVfx: "vfx.arcane_arcane_ice.idle",
  modelId: "tower_arcane_arcane_ice",
};

const arcaneArcaneLightningTower: TowerDef = {
  id: "tower_arcane_arcane_lightning",
  name: "Arcflux Twin",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo now crackles with captive lightning arcing between its rings.",
  tiers: buildTiers(
    { damage: 21, range: 7, fireRateMs: 640, projectileSpeed: 22, critChance: 0.3, critMultiplier: 2.4 },
    [670, 1380, 2730],
    [1, 1.22, 1.5],
    [
      "A single spark now leaps between two rings of the merged halo.",
      "Lightning courses continuously through half the halo's rings.",
      "A true arcflux twin, doubled rune-light and raw current fused into one halo.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "arcflux_twin_deeper_silence",
      name: "Deeper Silence",
      description: "Grand Fusion capstone. Suppresses the target's abilities far longer than Twin Rune alone, then overcharges it with captive current.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_lightning.ability_deeper_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2600,
      bonusDamage: 33,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.arcane_arcane_lightning.projectile",
  impactVfx: "vfx.arcane_arcane_lightning.impact",
  idleVfx: "vfx.arcane_arcane_lightning.idle",
  modelId: "tower_arcane_arcane_lightning",
};

const arcaneArcaneNatureTower: TowerDef = {
  id: "tower_arcane_arcane_nature",
  name: "Runegrove Twin",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo has grown a living ring of vine and glyph, rune-light and root intertwined.",
  tiers: buildTiers(
    { damage: 20, range: 6.8, fireRateMs: 780, projectileSpeed: 18, critChance: 0.26, critMultiplier: 2.1 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A single vine has grown along one ring of the merged halo.",
      "Half the halo is wrapped in living vine, glyphs peeking through the leaves.",
      "A true runegrove twin, doubled rune-light and living growth bound in one halo.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "runegrove_twin_deeper_silence",
      name: "Deeper Silence",
      description: "Grand Fusion capstone. Suppresses the target's abilities far longer than Twin Rune alone, then poisons it with rune-fed sap.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_nature.ability_deeper_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2600,
      bonusDamage: 29,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_arcane_nature.projectile",
  impactVfx: "vfx.arcane_arcane_nature.impact",
  idleVfx: "vfx.arcane_arcane_nature.idle",
  modelId: "tower_arcane_arcane_nature",
};

const arcaneArcaneEarthTower: TowerDef = {
  id: "tower_arcane_arcane_earth",
  name: "Runeforge Twin",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo now binds a floating slab of living stone at its center.",
  tiers: buildTiers(
    { damage: 27, range: 6.5, fireRateMs: 900, projectileSpeed: 16, critChance: 0.24, critMultiplier: 2.1 },
    [660, 1360, 2690],
    [1, 1.22, 1.5],
    [
      "A single fragment of stone now hovers within the merged halo.",
      "A full slab of rune-carved stone hovers at the halo's center.",
      "A true runeforge twin, doubled rune-light binding a hovering slab of living stone.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "runeforge_twin_deeper_silence",
      name: "Deeper Silence",
      description: "Grand Fusion capstone. Suppresses the target's abilities far longer than Twin Rune alone, then drops rune-bound stone on it.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_earth.ability_deeper_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 2600,
      bonusDamage: 36,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_arcane_earth.projectile",
  impactVfx: "vfx.arcane_arcane_earth.impact",
  idleVfx: "vfx.arcane_arcane_earth.idle",
  modelId: "tower_arcane_arcane_earth",
};

const arcaneArcaneShadowTower: TowerDef = {
  id: "tower_arcane_arcane_shadow",
  name: "Voidrune Twin",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo has been consumed by a curse from somewhere beyond its own glyphs.",
  tiers: buildTiers(
    { damage: 23, range: 7.1, fireRateMs: 820, projectileSpeed: 19, critChance: 0.27, critMultiplier: 2.2 },
    [665, 1370, 2700],
    [1, 1.22, 1.5],
    [
      "A single glyph on the merged halo has gone dark, hexed rather than lit.",
      "Half the halo's rings now pulse violet instead of their usual pale glow.",
      "A true voidrune twin, doubled rune-light entirely consumed by the curse it summoned.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "voidrune_twin_cursed_silence",
      name: "Cursed Silence",
      description: "Grand Fusion capstone. Brands the target with a severe curse and suppresses its abilities at once.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_shadow.ability_cursed_silence",
      statusKind: "curse",
      statusMagnitude: 0.45,
      statusDurationMs: 4200,
      bonusDamage: 34,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_arcane_shadow.projectile",
  impactVfx: "vfx.arcane_arcane_shadow.impact",
  idleVfx: "vfx.arcane_arcane_shadow.idle",
  modelId: "tower_arcane_arcane_shadow",
};

// ---------------------------------------------------------------------------
// Duplicate-parent Grand Fusion completion, batch 4 (FINAL) — every
// remaining shadow+shadow+Y (Twin Wraith as parent). This closes out the
// last combination category: every base pair, duplicate pair, distinct
// triad, and duplicate-parent triad in the game now has a real tower
// behind it.
// ---------------------------------------------------------------------------

const shadowShadowIceTower: TowerDef = {
  id: "tower_shadow_shadow_ice",
  name: "Hollowfrost Wraith",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Twin Wraith's doubled shroud has frozen mid-drift, ice clinging to every ragged fold.",
  tiers: buildTiers(
    { damage: 24, range: 6.2, fireRateMs: 780, projectileSpeed: 18 },
    [640, 1320, 2610],
    [1, 1.22, 1.5],
    [
      "A single fold of the shroud has iced over, eyes glinting through the frost.",
      "Half the shroud now trails frost, curse and cold drifting together.",
      "A true hollowfrost wraith, every fold of dark cloak sheathed in unmelting ice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "hollowfrost_wraith_deeper_curse",
      name: "Deeper Curse",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then chills it to the bone.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_ice.ability_deeper_curse",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4400,
      bonusDamage: 32,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.shadow_shadow_ice.projectile",
  impactVfx: "vfx.shadow_shadow_ice.impact",
  idleVfx: "vfx.shadow_shadow_ice.idle",
  modelId: "tower_shadow_shadow_ice",
};

const shadowShadowLightningTower: TowerDef = {
  id: "tower_shadow_shadow_lightning",
  name: "Voidbolt Wraith",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Twin Wraith's doubled shroud now crackles with cursed lightning between its ragged folds.",
  tiers: buildTiers(
    { damage: 20, range: 6.6, fireRateMs: 380, projectileSpeed: 24, critChance: 0.24, critMultiplier: 2 },
    [655, 1350, 2670],
    [1, 1.22, 1.5],
    [
      "A single spark of violet lightning now arcs between two folds of the shroud.",
      "Lightning courses continuously through half the shroud, cloak snapping with every arc.",
      "A true voidbolt wraith, doubled curse and raw current fused into one living storm-shroud.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "voidbolt_wraith_deeper_curse",
      name: "Deeper Curse",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then arcs cursed lightning through it.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_lightning.ability_deeper_curse",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4400,
      bonusDamage: 34,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.shadow_shadow_lightning.projectile",
  impactVfx: "vfx.shadow_shadow_lightning.impact",
  idleVfx: "vfx.shadow_shadow_lightning.idle",
  modelId: "tower_shadow_shadow_lightning",
};

const shadowShadowNatureTower: TowerDef = {
  id: "tower_shadow_shadow_nature",
  name: "Blightwraith Grove",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Twin Wraith's doubled shroud has grown withered vines that never stop reaching for the light.",
  tiers: buildTiers(
    { damage: 19, range: 6.1, fireRateMs: 720, projectileSpeed: 17 },
    [625, 1290, 2560],
    [1, 1.22, 1.5],
    [
      "A single withered vine has grown from beneath the shroud's hem.",
      "Half the shroud now trails withered vines, grey and slow-reaching.",
      "A true blightwraith grove, doubled curse and withered growth grown into one being.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "blightwraith_grove_deeper_curse",
      name: "Deeper Curse",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then poisons it with withering sap.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_nature.ability_deeper_curse",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4400,
      bonusDamage: 30,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.shadow_shadow_nature.projectile",
  impactVfx: "vfx.shadow_shadow_nature.impact",
  idleVfx: "vfx.shadow_shadow_nature.idle",
  modelId: "tower_shadow_shadow_nature",
};

const shadowShadowEarthTower: TowerDef = {
  id: "tower_shadow_shadow_earth",
  name: "Wraithstone Cairn",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Twin Wraith's doubled shroud now drapes over a cairn of cold grey stone it never leaves.",
  tiers: buildTiers(
    { damage: 27, range: 5.9, fireRateMs: 850, projectileSpeed: 15, splashRadius: 1.3 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A single stone has gathered beneath the shroud's hem.",
      "A half-built cairn now anchors the shroud, stone and dark cloak fused at the base.",
      "A true wraithstone cairn, doubled curse anchored permanently to unmoving grey stone.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "wraithstone_cairn_deeper_curse",
      name: "Deeper Curse",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then crushes it beneath cursed stone.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_earth.ability_deeper_curse",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4400,
      bonusDamage: 37,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.shadow_shadow_earth.projectile",
  impactVfx: "vfx.shadow_shadow_earth.impact",
  idleVfx: "vfx.shadow_shadow_earth.idle",
  modelId: "tower_shadow_shadow_earth",
};

const shadowShadowArcaneTower: TowerDef = {
  id: "tower_shadow_shadow_arcane",
  name: "Voidglass Wraith",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Twin Wraith's doubled shroud now drifts within a halo of hexed rune-light that shows no reflection.",
  tiers: buildTiers(
    { damage: 21, range: 6.7, fireRateMs: 700, projectileSpeed: 18, critChance: 0.27, critMultiplier: 2.2 },
    [650, 1340, 2650],
    [1, 1.22, 1.5],
    [
      "A single hexed glyph now orbits the shroud, all three eyes fixed on it.",
      "A full ring of hexed glyphs orbits the shroud, dark and rune-light intertwined.",
      "A true voidglass wraith, doubled curse bound permanently to a halo of hexed rune-light.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "voidglass_wraith_deeper_curse",
      name: "Deeper Curse",
      description: "Grand Fusion capstone. Brands the target with a severe curse, then lances it with hexed rune-light.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_arcane.ability_deeper_curse",
      statusKind: "curse",
      statusMagnitude: 0.5,
      statusDurationMs: 4400,
      bonusDamage: 33,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.shadow_shadow_arcane.projectile",
  impactVfx: "vfx.shadow_shadow_arcane.impact",
  idleVfx: "vfx.shadow_shadow_arcane.idle",
  modelId: "tower_shadow_shadow_arcane",
};

// ---------------------------------------------------------------------------
// Triple-same-element (XXX) capstones — a Twin/duplicate parent merged with
// a THIRD copy of its own element, rather than a distinct third element.
// The purest, most specialized tier possible: no cross-element flavor, just
// one element pushed to its absolute limit. One per element (7 total).
// ---------------------------------------------------------------------------

const fireFireFireTower: TowerDef = {
  id: "tower_fire_fire_fire",
  name: "Inferno Apex",
  element: "fire+fire",
  isFusion: true,
  flavorText: "Twin Ember's doubled blaze has been fed a third flame until fire is the only thing left of it.",
  tiers: buildTiers(
    { damage: 52, range: 6.3, fireRateMs: 460, projectileSpeed: 22, splashRadius: 2 },
    [670, 1380, 2730],
    [1, 1.22, 1.5],
    [
      "A third flame has been driven into the cairn, all restraint burned away.",
      "The cairn no longer resembles stone at all — a standing column of pure fire.",
      "A true inferno apex, three flames' worth of fire compressed into one unbroken pillar.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "inferno_apex_apex_ignite",
      name: "Apex Ignite",
      description: "Grand Fusion capstone. Sets the target ablaze with the fiercest burn fire alone can produce.",
      cooldownMs: 9200,
      vfxId: "vfx.fire_fire_fire.ability_apex_ignite",
      statusKind: "burn",
      statusMagnitude: 18,
      statusDurationMs: 4200,
      bonusDamage: 46,
      damageElement: "fire",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.fire_fire_fire.projectile",
  impactVfx: "vfx.fire_fire_fire.impact",
  idleVfx: "vfx.fire_fire_fire.idle",
  modelId: "tower_fire_fire_fire",
};

const iceIceIceTower: TowerDef = {
  id: "tower_ice_ice_ice",
  name: "Absolute Zero Spire",
  element: "ice+ice",
  isFusion: true,
  flavorText: "Twin Frost's fused lattice has taken a third crystal into itself, cold enough to stop motion outright.",
  tiers: buildTiers(
    { damage: 38, range: 6.9, fireRateMs: 500, projectileSpeed: 20 },
    [660, 1360, 2690],
    [1, 1.22, 1.5],
    [
      "A third crystal has fused into the lattice, frost spreading visibly outward.",
      "The lattice has grown so cold the air itself glitters around it.",
      "A true absolute zero spire, three crystals' worth of cold locked into one unbroken lattice.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "absolute_zero_spire_absolute_chill",
      name: "Absolute Chill",
      description: "Grand Fusion capstone. Chills the target with the deepest cold ice alone can produce, nearly freezing it in place.",
      cooldownMs: 9200,
      vfxId: "vfx.ice_ice_ice.ability_absolute_chill",
      statusKind: "chill",
      statusMagnitude: 0.75,
      statusDurationMs: 3200,
      bonusDamage: 38,
      damageElement: "ice",
    }),
  ],
  targeting: "weakest",
  projectileVfx: "vfx.ice_ice_ice.projectile",
  impactVfx: "vfx.ice_ice_ice.impact",
  idleVfx: "vfx.ice_ice_ice.idle",
  modelId: "tower_ice_ice_ice",
};

const lightningLightningLightningTower: TowerDef = {
  id: "tower_lightning_lightning_lightning",
  name: "Thunderhead Apex",
  element: "lightning+lightning",
  isFusion: true,
  flavorText: "Twin Storm's looping coil now carries a third current, arcing faster than the eye can follow.",
  tiers: buildTiers(
    { damage: 30, range: 7.1, fireRateMs: 220, projectileSpeed: 30, critChance: 0.3, critMultiplier: 2.4 },
    [685, 1410, 2790],
    [1, 1.22, 1.5],
    [
      "A third current now loops through the coil, sparks constantly leaping free.",
      "The coil has become a single continuous storm, current never once resting.",
      "A true thunderhead apex, three currents' worth of lightning locked into one endless discharge.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "thunderhead_apex_apex_overcharge",
      name: "Apex Overcharge",
      description: "Grand Fusion capstone. Overcharges the target with the strongest shock lightning alone can produce.",
      cooldownMs: 9200,
      vfxId: "vfx.lightning_lightning_lightning.ability_apex_overcharge",
      statusKind: "shock",
      statusMagnitude: 1,
      statusDurationMs: 1500,
      bonusDamage: 42,
      damageElement: "lightning",
    }),
  ],
  targeting: "closest",
  projectileVfx: "vfx.lightning_lightning_lightning.projectile",
  impactVfx: "vfx.lightning_lightning_lightning.impact",
  idleVfx: "vfx.lightning_lightning_lightning.idle",
  modelId: "tower_lightning_lightning_lightning",
};

const natureNatureNatureTower: TowerDef = {
  id: "tower_nature_nature_nature",
  name: "Primordial Overgrowth",
  element: "nature+nature",
  isFusion: true,
  flavorText: "Twin Thorn's doubled canopy has taken root a third time, growth outpacing anything that could contain it.",
  tiers: buildTiers(
    { damage: 34, range: 6.4, fireRateMs: 640, projectileSpeed: 16, splashRadius: 1.6 },
    [645, 1330, 2630],
    [1, 1.22, 1.5],
    [
      "A third sapling has taken root beside the doubled trunk.",
      "The canopy has grown so dense it blocks out the sky above it entirely.",
      "A true primordial overgrowth, three trunks' worth of growth fused into one unstoppable tangle.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "primordial_overgrowth_apex_venom",
      name: "Apex Venom",
      description: "Grand Fusion capstone. Poisons the target with the most virulent venom nature alone can produce.",
      cooldownMs: 9200,
      vfxId: "vfx.nature_nature_nature.ability_apex_venom",
      statusKind: "poison",
      statusMagnitude: 12,
      statusDurationMs: 4600,
      bonusDamage: 40,
      damageElement: "nature",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.nature_nature_nature.projectile",
  impactVfx: "vfx.nature_nature_nature.impact",
  idleVfx: "vfx.nature_nature_nature.idle",
  modelId: "tower_nature_nature_nature",
};

const earthEarthEarthTower: TowerDef = {
  id: "tower_earth_earth_earth",
  name: "Bedrock Apex",
  element: "earth+earth",
  isFusion: true,
  flavorText: "Twin Stone's fused cairn has taken in a third boulder, weight enough now to press down through bedrock.",
  tiers: buildTiers(
    { damage: 50, range: 5.9, fireRateMs: 1000, projectileSpeed: 13, splashRadius: 2.1 },
    [665, 1370, 2710],
    [1, 1.22, 1.5],
    [
      "A third boulder has settled onto the fused cairn, stone groaning under the weight.",
      "The cairn has grown so massive its base has begun to sink into the ground.",
      "A true bedrock apex, three boulders' worth of stone fused into one immovable mass.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "bedrock_apex_apex_sunder",
      name: "Apex Sunder",
      description: "Grand Fusion capstone. Cracks away the most armor earth alone can shatter.",
      cooldownMs: 9200,
      vfxId: "vfx.earth_earth_earth.ability_apex_sunder",
      statusKind: "sunder",
      statusMagnitude: 0.55,
      statusDurationMs: 4600,
      bonusDamage: 44,
      damageElement: "earth",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.earth_earth_earth.projectile",
  impactVfx: "vfx.earth_earth_earth.impact",
  idleVfx: "vfx.earth_earth_earth.idle",
  modelId: "tower_earth_earth_earth",
};

const arcaneArcaneArcaneTower: TowerDef = {
  id: "tower_arcane_arcane_arcane",
  name: "Arcane Singularity",
  element: "arcane+arcane",
  isFusion: true,
  flavorText: "Twin Rune's merged halo has drawn in a third ring, rune-light collapsing inward on itself.",
  tiers: buildTiers(
    { damage: 30, range: 7.3, fireRateMs: 680, projectileSpeed: 20, critChance: 0.32, critMultiplier: 2.5 },
    [700, 1440, 2850],
    [1, 1.22, 1.5],
    [
      "A third ring has drawn into the merged halo, glyphs beginning to blur together.",
      "The halo has collapsed into a single blinding band of pure rune-light.",
      "A true arcane singularity, three rings' worth of rune-light compressed into one point of force.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "arcane_singularity_apex_silence",
      name: "Apex Silence",
      description: "Grand Fusion capstone. Suppresses the target's abilities for the longest span arcane force alone can hold.",
      cooldownMs: 9200,
      vfxId: "vfx.arcane_arcane_arcane.ability_apex_silence",
      statusKind: "silence",
      statusMagnitude: 1,
      statusDurationMs: 3400,
      bonusDamage: 41,
      damageElement: "arcane",
    }),
  ],
  targeting: "strongest",
  projectileVfx: "vfx.arcane_arcane_arcane.projectile",
  impactVfx: "vfx.arcane_arcane_arcane.impact",
  idleVfx: "vfx.arcane_arcane_arcane.idle",
  modelId: "tower_arcane_arcane_arcane",
};

const shadowShadowShadowTower: TowerDef = {
  id: "tower_shadow_shadow_shadow",
  name: "Umbral Apex",
  element: "shadow+shadow",
  isFusion: true,
  flavorText: "Twin Wraith's doubled shroud has taken on a third cloak of dark, until no light reaches its center at all.",
  tiers: buildTiers(
    { damage: 28, range: 6.8, fireRateMs: 720, projectileSpeed: 19 },
    [680, 1400, 2770],
    [1, 1.22, 1.5],
    [
      "A third cloak of shadow has wound itself into the shroud, eyes almost lost within it.",
      "The shroud has grown so dense it swallows light within a short distance of itself.",
      "A true umbral apex, three cloaks' worth of living dark fused into one absolute curse.",
    ],
  ),
  abilities: [
    makeAbility({
      id: "umbral_apex_apex_curse",
      name: "Apex Curse",
      description: "Grand Fusion capstone. Brands the target with the deepest curse shadow alone can lay upon it.",
      cooldownMs: 9200,
      vfxId: "vfx.shadow_shadow_shadow.ability_apex_curse",
      statusKind: "curse",
      statusMagnitude: 0.65,
      statusDurationMs: 4800,
      bonusDamage: 44,
      damageElement: "shadow",
    }),
  ],
  targeting: "first",
  projectileVfx: "vfx.shadow_shadow_shadow.projectile",
  impactVfx: "vfx.shadow_shadow_shadow.impact",
  idleVfx: "vfx.shadow_shadow_shadow.idle",
  modelId: "tower_shadow_shadow_shadow",
};

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------

const ALL_TOWERS: TowerDef[] = [
  fireTower,
  iceTower,
  lightningTower,
  natureTower,
  earthTower,
  arcaneTower,
  shadowTower,
  fireIceTower,
  fireLightningTower,
  fireNatureTower,
  fireEarthTower,
  fireArcaneTower,
  iceLightningTower,
  iceNatureTower,
  iceEarthTower,
  iceArcaneTower,
  lightningNatureTower,
  lightningEarthTower,
  lightningArcaneTower,
  natureEarthTower,
  natureArcaneTower,
  earthArcaneTower,
  fireShadowTower,
  iceShadowTower,
  lightningShadowTower,
  natureShadowTower,
  earthShadowTower,
  arcaneShadowTower,
  fireFireTower,
  iceIceTower,
  lightningLightningTower,
  natureNatureTower,
  earthEarthTower,
  arcaneArcaneTower,
  shadowShadowTower,
  fireIceLightningTower,
  fireNatureEarthTower,
  iceNatureArcaneTower,
  lightningEarthArcaneTower,
  fireLightningArcaneTower,
  iceNatureEarthTower,
  fireIceNatureTower,
  iceLightningArcaneTower,
  fireLightningEarthTower,
  natureEarthArcaneTower,
  lightningNatureEarthTower,
  fireNatureArcaneTower,
  fireIceEarthTower,
  fireIceArcaneTower,
  fireLightningNatureTower,
  fireEarthArcaneTower,
  iceLightningNatureTower,
  iceLightningEarthTower,
  iceEarthArcaneTower,
  lightningNatureArcaneTower,
  fireFireIceTower,
  iceIceShadowTower,
  lightningLightningNatureTower,
  shadowShadowFireTower,
  earthArcaneShadowTower,
  natureArcaneShadowTower,
  fireIceShadowTower,
  fireLightningShadowTower,
  fireNatureShadowTower,
  fireEarthShadowTower,
  fireArcaneShadowTower,
  iceLightningShadowTower,
  iceNatureShadowTower,
  iceEarthShadowTower,
  iceArcaneShadowTower,
  lightningNatureShadowTower,
  lightningEarthShadowTower,
  lightningArcaneShadowTower,
  natureEarthShadowTower,
  fireFireLightningTower,
  fireFireNatureTower,
  fireFireEarthTower,
  fireFireArcaneTower,
  fireFireShadowTower,
  iceIceFireTower,
  iceIceLightningTower,
  iceIceNatureTower,
  iceIceEarthTower,
  iceIceArcaneTower,
  lightningLightningFireTower,
  lightningLightningIceTower,
  lightningLightningEarthTower,
  lightningLightningArcaneTower,
  lightningLightningShadowTower,
  natureNatureFireTower,
  natureNatureIceTower,
  natureNatureLightningTower,
  natureNatureEarthTower,
  natureNatureArcaneTower,
  natureNatureShadowTower,
  earthEarthFireTower,
  earthEarthIceTower,
  earthEarthLightningTower,
  earthEarthNatureTower,
  earthEarthArcaneTower,
  earthEarthShadowTower,
  arcaneArcaneFireTower,
  arcaneArcaneIceTower,
  arcaneArcaneLightningTower,
  arcaneArcaneNatureTower,
  arcaneArcaneEarthTower,
  arcaneArcaneShadowTower,
  shadowShadowIceTower,
  shadowShadowLightningTower,
  shadowShadowNatureTower,
  shadowShadowEarthTower,
  shadowShadowArcaneTower,
  fireFireFireTower,
  iceIceIceTower,
  lightningLightningLightningTower,
  natureNatureNatureTower,
  earthEarthEarthTower,
  arcaneArcaneArcaneTower,
  shadowShadowShadowTower,
];

export const TOWER_REGISTRY: Map<string, TowerDef> = new Map(ALL_TOWERS.map((t) => [t.id, t]));

export function getTowerDef(id: string): TowerDef | undefined {
  return TOWER_REGISTRY.get(id);
}

export function listBaseTowers(): TowerDef[] {
  return ALL_TOWERS.filter((t) => !t.isFusion);
}

export function listFusionTowers(): TowerDef[] {
  return ALL_TOWERS.filter((t) => t.isFusion);
}

export function listAllTowers(): TowerDef[] {
  return ALL_TOWERS.slice();
}
