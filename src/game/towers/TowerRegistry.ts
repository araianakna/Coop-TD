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
  } = opts;

  return {
    id,
    name,
    description,
    cooldownMs,
    onTrigger: (ctx: TowerAbilityContext) => {
      const worldPos: [number, number, number] = [ctx.position.x, 0.6, ctx.position.z];
      ctx.emitVfx(vfxId, worldPos);

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
