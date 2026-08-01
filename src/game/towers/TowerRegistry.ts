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
// Public registry
// ---------------------------------------------------------------------------

const ALL_TOWERS: TowerDef[] = [
  fireTower,
  iceTower,
  lightningTower,
  natureTower,
  earthTower,
  arcaneTower,
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
