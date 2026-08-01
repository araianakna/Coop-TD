// Wave data for Map01. Pure data — no timers/scheduling here; the
// orchestrator (Game.ts) is responsible for reading `WaveDef[]` in order,
// spawning `count` copies of `enemyId` spaced `intervalMs` apart per
// `WaveSpawnEntry`, scaling health by `healthMultiplier`, and — when
// `bossId` is set — spawning that boss once alongside/after the wave's
// regular spawns.
//
// Difficulty curve: composition variety ramps from a single grunt type up
// to 4-5 concurrent enemy types by the late game; `healthMultiplier` climbs
// from 1.0 to ~3.6 by wave 20; `intervalMs` on swarm entries (voltling,
// thornling) tightens in later waves to sell "swarm" pressure. Two boss
// waves: wave 10 (Emberback) as the midgame gate, wave 20 (The Hollow
// Glacier) as the finale, each preceded by a breather-ish wave and backed
// by a full mixed-composition escort.
//
// Waves 21-40 continue the same curve past the original finale:
// `healthMultiplier` keeps climbing from ~3.6 up to ~10.8, `intervalMs` on
// swarm entries keeps tightening (down toward ~85-100ms for voltling by
// wave 40), and composition variety keeps widening — wave 30 is a
// deliberate "mega gauntlet" milestone that spawns all ten regular enemy
// types at once (no boss) before the back stretch resumes. Two new
// regular enemies are folded in starting here: `wraithguard` (an armored
// flying tank, introduced wave 23) and `runeshell` (a four-element
// resistance puzzle unit, introduced wave 27), each debuting at a
// discounted `healthMultiplier` relative to that wave's other entries —
// the same "soft intro" convention wave 8 used for quagbrute — before
// joining the full-strength rotation. Wave 40 is a single finale boss gate
// (Thal'vor, the Stormbound Sovereign, `stormsovereign`) preceded by a
// breather/staging wave (39) exactly like wave 19 was for wave 20, backed
// by the largest mixed escort in the campaign.

import type { WaveDef, WaveSpawnEntry } from "@/game/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Difficulty tuning
// ---------------------------------------------------------------------------
// Applied uniformly over the hand-authored curve below rather than by
// re-editing every one of the 40 wave blocks: waves run busier (more
// concurrent enemies) but each enemy is a bit softer, so the net per-wave
// threat is down a notch even though there's more on screen.
const WAVE_SIZE_FACTOR = 1.2; // ~20% more enemies per wave
const DIFFICULTY_HEALTH_FACTOR = 0.78; // ~22% less health, before the size bump

const RAW_WAVES: WaveDef[] = [
  // 1 — tutorial trickle
  {
    index: 1,
    spawns: [{ enemyId: "thornling", count: 6, intervalMs: 900, healthMultiplier: 1.0 }],
  },
  // 2 — more thornlings, tighter spacing
  {
    index: 2,
    spawns: [{ enemyId: "thornling", count: 9, intervalMs: 750, healthMultiplier: 1.05 }],
  },
  // 3 — introduce the swarmer
  {
    index: 3,
    spawns: [
      { enemyId: "thornling", count: 6, intervalMs: 800, healthMultiplier: 1.1 },
      { enemyId: "voltling", count: 8, intervalMs: 350, healthMultiplier: 1.0 },
    ],
  },
  // 4 — introduce the tank
  {
    index: 4,
    spawns: [
      { enemyId: "thornling", count: 6, intervalMs: 700, healthMultiplier: 1.15 },
      { enemyId: "cragback", count: 3, intervalMs: 1400, healthMultiplier: 1.0 },
    ],
  },
  // 5 — introduce the flyer
  {
    index: 5,
    spawns: [
      { enemyId: "skitterwing", count: 6, intervalMs: 800, healthMultiplier: 1.05 },
      { enemyId: "voltling", count: 10, intervalMs: 320, healthMultiplier: 1.1 },
      { enemyId: "cragback", count: 2, intervalMs: 1500, healthMultiplier: 1.1 },
    ],
  },
  // 6 — introduce the burrower
  {
    index: 6,
    spawns: [
      { enemyId: "sandveil", count: 5, intervalMs: 900, healthMultiplier: 1.1 },
      { enemyId: "thornling", count: 8, intervalMs: 650, healthMultiplier: 1.2 },
      { enemyId: "skitterwing", count: 4, intervalMs: 750, healthMultiplier: 1.15 },
    ],
  },
  // 7 — introduce frostfang, ramp swarm pressure
  {
    index: 7,
    spawns: [
      { enemyId: "frostfang", count: 6, intervalMs: 800, healthMultiplier: 1.15 },
      { enemyId: "voltling", count: 14, intervalMs: 280, healthMultiplier: 1.2 },
      { enemyId: "cragback", count: 3, intervalMs: 1300, healthMultiplier: 1.2 },
    ],
  },
  // 8 — introduce cinderling + first quagbrute
  {
    index: 8,
    spawns: [
      { enemyId: "cinderling", count: 7, intervalMs: 700, healthMultiplier: 1.2 },
      { enemyId: "quagbrute", count: 1, intervalMs: 2000, healthMultiplier: 1.0 },
      { enemyId: "sandveil", count: 6, intervalMs: 750, healthMultiplier: 1.25 },
    ],
  },
  // 9 — full mixed composition, breather before the boss
  {
    index: 9,
    spawns: [
      { enemyId: "thornling", count: 10, intervalMs: 550, healthMultiplier: 1.3 },
      { enemyId: "frostfang", count: 6, intervalMs: 750, healthMultiplier: 1.3 },
      { enemyId: "skitterwing", count: 6, intervalMs: 650, healthMultiplier: 1.3 },
      { enemyId: "voltling", count: 12, intervalMs: 300, healthMultiplier: 1.3 },
    ],
  },
  // 10 — BOSS: Emberback, the Molten Colossus, with a fire-resistant escort
  {
    index: 10,
    spawns: [
      { enemyId: "cinderling", count: 8, intervalMs: 500, healthMultiplier: 1.4 },
      { enemyId: "cragback", count: 4, intervalMs: 1100, healthMultiplier: 1.4 },
    ],
    bossId: "cindercolossus",
  },
  // 11 — post-boss cooldown, but composition keeps widening
  {
    index: 11,
    spawns: [
      { enemyId: "sandveil", count: 8, intervalMs: 650, healthMultiplier: 1.5 },
      { enemyId: "quagbrute", count: 2, intervalMs: 1800, healthMultiplier: 1.4 },
    ],
  },
  // 12
  {
    index: 12,
    spawns: [
      { enemyId: "voltling", count: 18, intervalMs: 240, healthMultiplier: 1.5 },
      { enemyId: "frostfang", count: 8, intervalMs: 600, healthMultiplier: 1.5 },
      { enemyId: "skitterwing", count: 8, intervalMs: 550, healthMultiplier: 1.5 },
    ],
  },
  // 13
  {
    index: 13,
    spawns: [
      { enemyId: "cragback", count: 6, intervalMs: 900, healthMultiplier: 1.6 },
      { enemyId: "cinderling", count: 10, intervalMs: 450, healthMultiplier: 1.6 },
      { enemyId: "thornling", count: 12, intervalMs: 400, healthMultiplier: 1.6 },
    ],
  },
  // 14
  {
    index: 14,
    spawns: [
      { enemyId: "quagbrute", count: 3, intervalMs: 1600, healthMultiplier: 1.6 },
      { enemyId: "sandveil", count: 10, intervalMs: 550, healthMultiplier: 1.7 },
      { enemyId: "voltling", count: 16, intervalMs: 220, healthMultiplier: 1.7 },
    ],
  },
  // 15 — heavy mixed swarm, midpoint spike
  {
    index: 15,
    spawns: [
      { enemyId: "thornling", count: 14, intervalMs: 350, healthMultiplier: 1.8 },
      { enemyId: "skitterwing", count: 10, intervalMs: 450, healthMultiplier: 1.8 },
      { enemyId: "frostfang", count: 8, intervalMs: 550, healthMultiplier: 1.8 },
      { enemyId: "cragback", count: 5, intervalMs: 950, healthMultiplier: 1.8 },
    ],
  },
  // 16
  {
    index: 16,
    spawns: [
      { enemyId: "cinderling", count: 12, intervalMs: 380, healthMultiplier: 2.0 },
      { enemyId: "voltling", count: 20, intervalMs: 200, healthMultiplier: 2.0 },
      { enemyId: "quagbrute", count: 3, intervalMs: 1500, healthMultiplier: 1.9 },
    ],
  },
  // 17
  {
    index: 17,
    spawns: [
      { enemyId: "sandveil", count: 12, intervalMs: 500, healthMultiplier: 2.2 },
      { enemyId: "frostfang", count: 10, intervalMs: 480, healthMultiplier: 2.2 },
      { enemyId: "cragback", count: 6, intervalMs: 850, healthMultiplier: 2.2 },
      { enemyId: "skitterwing", count: 10, intervalMs: 420, healthMultiplier: 2.2 },
    ],
  },
  // 18
  {
    index: 18,
    spawns: [
      { enemyId: "quagbrute", count: 4, intervalMs: 1400, healthMultiplier: 2.4 },
      { enemyId: "thornling", count: 16, intervalMs: 300, healthMultiplier: 2.4 },
      { enemyId: "voltling", count: 22, intervalMs: 180, healthMultiplier: 2.4 },
      { enemyId: "cinderling", count: 10, intervalMs: 400, healthMultiplier: 2.4 },
    ],
  },
  // 19 — final breather / staging wave before the finale boss
  {
    index: 19,
    spawns: [
      { enemyId: "frostfang", count: 12, intervalMs: 400, healthMultiplier: 2.7 },
      { enemyId: "cragback", count: 8, intervalMs: 750, healthMultiplier: 2.7 },
      { enemyId: "sandveil", count: 10, intervalMs: 450, healthMultiplier: 2.7 },
      { enemyId: "skitterwing", count: 12, intervalMs: 380, healthMultiplier: 2.7 },
    ],
  },
  // 20 — FINALE BOSS: The Hollow Glacier, with a full fire-vulnerable escort
  {
    index: 20,
    spawns: [
      { enemyId: "thornling", count: 14, intervalMs: 260, healthMultiplier: 3.2 },
      { enemyId: "voltling", count: 24, intervalMs: 160, healthMultiplier: 3.2 },
      { enemyId: "cinderling", count: 12, intervalMs: 320, healthMultiplier: 3.4 },
      { enemyId: "quagbrute", count: 4, intervalMs: 1200, healthMultiplier: 3.4 },
      { enemyId: "cragback", count: 6, intervalMs: 700, healthMultiplier: 3.4 },
    ],
    bossId: "hollowglacier",
  },

  // -----------------------------------------------------------------------
  // Waves 21-40 — post-finale escalation
  // -----------------------------------------------------------------------

  // 21 — ramp resumes right where wave 20 left off
  {
    index: 21,
    spawns: [
      { enemyId: "thornling", count: 14, intervalMs: 300, healthMultiplier: 3.6 },
      { enemyId: "cragback", count: 7, intervalMs: 800, healthMultiplier: 3.6 },
      { enemyId: "voltling", count: 22, intervalMs: 170, healthMultiplier: 3.6 },
    ],
  },
  // 22
  {
    index: 22,
    spawns: [
      { enemyId: "skitterwing", count: 12, intervalMs: 400, healthMultiplier: 3.9 },
      { enemyId: "frostfang", count: 10, intervalMs: 420, healthMultiplier: 3.9 },
      { enemyId: "sandveil", count: 12, intervalMs: 400, healthMultiplier: 3.9 },
      { enemyId: "quagbrute", count: 4, intervalMs: 1200, healthMultiplier: 3.8 },
    ],
  },
  // 23 — introduce Wraithguard Sentinel (armored flying tank)
  {
    index: 23,
    spawns: [
      { enemyId: "cinderling", count: 12, intervalMs: 340, healthMultiplier: 4.1 },
      { enemyId: "cragback", count: 8, intervalMs: 750, healthMultiplier: 4.1 },
      { enemyId: "wraithguard", count: 3, intervalMs: 1500, healthMultiplier: 3.0 },
    ],
  },
  // 24
  {
    index: 24,
    spawns: [
      { enemyId: "thornling", count: 16, intervalMs: 260, healthMultiplier: 4.4 },
      { enemyId: "voltling", count: 24, intervalMs: 150, healthMultiplier: 4.4 },
      { enemyId: "wraithguard", count: 4, intervalMs: 1350, healthMultiplier: 4.1 },
      { enemyId: "quagbrute", count: 5, intervalMs: 1100, healthMultiplier: 4.3 },
    ],
  },
  // 25
  {
    index: 25,
    spawns: [
      { enemyId: "frostfang", count: 12, intervalMs: 360, healthMultiplier: 4.6 },
      { enemyId: "skitterwing", count: 14, intervalMs: 320, healthMultiplier: 4.6 },
      { enemyId: "sandveil", count: 12, intervalMs: 360, healthMultiplier: 4.6 },
      { enemyId: "wraithguard", count: 5, intervalMs: 1250, healthMultiplier: 4.4 },
    ],
  },
  // 26
  {
    index: 26,
    spawns: [
      { enemyId: "cinderling", count: 14, intervalMs: 300, healthMultiplier: 4.9 },
      { enemyId: "cragback", count: 9, intervalMs: 700, healthMultiplier: 4.9 },
      { enemyId: "voltling", count: 26, intervalMs: 140, healthMultiplier: 4.9 },
      { enemyId: "wraithguard", count: 5, intervalMs: 1200, healthMultiplier: 4.7 },
    ],
  },
  // 27 — introduce Runeshell Warden (4-element resistance puzzle unit)
  {
    index: 27,
    spawns: [
      { enemyId: "thornling", count: 16, intervalMs: 240, healthMultiplier: 5.2 },
      { enemyId: "quagbrute", count: 6, intervalMs: 1000, healthMultiplier: 5.1 },
      { enemyId: "wraithguard", count: 6, intervalMs: 1150, healthMultiplier: 5.1 },
      { enemyId: "runeshell", count: 3, intervalMs: 1600, healthMultiplier: 3.6 },
    ],
  },
  // 28
  {
    index: 28,
    spawns: [
      { enemyId: "sandveil", count: 14, intervalMs: 320, healthMultiplier: 5.5 },
      { enemyId: "frostfang", count: 14, intervalMs: 320, healthMultiplier: 5.5 },
      { enemyId: "runeshell", count: 4, intervalMs: 1500, healthMultiplier: 5.1 },
      { enemyId: "voltling", count: 28, intervalMs: 130, healthMultiplier: 5.5 },
    ],
  },
  // 29 — breather / staging before the wave 30 gauntlet
  {
    index: 29,
    spawns: [
      { enemyId: "skitterwing", count: 16, intervalMs: 300, healthMultiplier: 5.9 },
      { enemyId: "cragback", count: 10, intervalMs: 650, healthMultiplier: 5.9 },
      { enemyId: "runeshell", count: 5, intervalMs: 1400, healthMultiplier: 5.6 },
      { enemyId: "wraithguard", count: 7, intervalMs: 1100, healthMultiplier: 5.7 },
    ],
  },
  // 30 — MEGA GAUNTLET: all ten regular enemy types at once, no boss.
  // A deliberate milestone wave (not just "another wave with more HP") —
  // every archetype in the roster on screen together.
  {
    index: 30,
    spawns: [
      { enemyId: "thornling", count: 16, intervalMs: 210, healthMultiplier: 6.3 },
      { enemyId: "voltling", count: 28, intervalMs: 120, healthMultiplier: 6.3 },
      { enemyId: "cinderling", count: 14, intervalMs: 260, healthMultiplier: 6.3 },
      { enemyId: "quagbrute", count: 6, intervalMs: 900, healthMultiplier: 6.2 },
      { enemyId: "cragback", count: 9, intervalMs: 600, healthMultiplier: 6.3 },
      { enemyId: "sandveil", count: 12, intervalMs: 300, healthMultiplier: 6.3 },
      { enemyId: "frostfang", count: 12, intervalMs: 300, healthMultiplier: 6.3 },
      { enemyId: "skitterwing", count: 12, intervalMs: 280, healthMultiplier: 6.3 },
      { enemyId: "wraithguard", count: 7, intervalMs: 1050, healthMultiplier: 6.2 },
      { enemyId: "runeshell", count: 6, intervalMs: 1350, healthMultiplier: 6.0 },
    ],
  },
  // 31
  {
    index: 31,
    spawns: [
      { enemyId: "frostfang", count: 16, intervalMs: 260, healthMultiplier: 6.7 },
      { enemyId: "sandveil", count: 16, intervalMs: 260, healthMultiplier: 6.7 },
      { enemyId: "skitterwing", count: 18, intervalMs: 240, healthMultiplier: 6.7 },
      { enemyId: "runeshell", count: 6, intervalMs: 1300, healthMultiplier: 6.5 },
    ],
  },
  // 32
  {
    index: 32,
    spawns: [
      { enemyId: "cragback", count: 10, intervalMs: 560, healthMultiplier: 7.0 },
      { enemyId: "wraithguard", count: 8, intervalMs: 1000, healthMultiplier: 7.0 },
      { enemyId: "voltling", count: 30, intervalMs: 110, healthMultiplier: 7.0 },
      { enemyId: "cinderling", count: 16, intervalMs: 230, healthMultiplier: 7.0 },
    ],
  },
  // 33
  {
    index: 33,
    spawns: [
      { enemyId: "quagbrute", count: 7, intervalMs: 850, healthMultiplier: 7.4 },
      { enemyId: "runeshell", count: 7, intervalMs: 1250, healthMultiplier: 7.2 },
      { enemyId: "thornling", count: 18, intervalMs: 190, healthMultiplier: 7.4 },
      { enemyId: "frostfang", count: 16, intervalMs: 250, healthMultiplier: 7.4 },
    ],
  },
  // 34
  {
    index: 34,
    spawns: [
      { enemyId: "sandveil", count: 16, intervalMs: 250, healthMultiplier: 7.8 },
      { enemyId: "skitterwing", count: 18, intervalMs: 230, healthMultiplier: 7.8 },
      { enemyId: "wraithguard", count: 9, intervalMs: 950, healthMultiplier: 7.6 },
      { enemyId: "voltling", count: 32, intervalMs: 105, healthMultiplier: 7.8 },
    ],
  },
  // 35 — midpoint spike (mirrors wave 15's role)
  {
    index: 35,
    spawns: [
      { enemyId: "thornling", count: 20, intervalMs: 170, healthMultiplier: 8.2 },
      { enemyId: "cragback", count: 11, intervalMs: 540, healthMultiplier: 8.2 },
      { enemyId: "cinderling", count: 18, intervalMs: 210, healthMultiplier: 8.2 },
      { enemyId: "runeshell", count: 8, intervalMs: 1200, healthMultiplier: 8.0 },
      { enemyId: "wraithguard", count: 9, intervalMs: 900, healthMultiplier: 8.0 },
    ],
  },
  // 36
  {
    index: 36,
    spawns: [
      { enemyId: "frostfang", count: 18, intervalMs: 230, healthMultiplier: 8.6 },
      { enemyId: "sandveil", count: 18, intervalMs: 240, healthMultiplier: 8.6 },
      { enemyId: "quagbrute", count: 8, intervalMs: 800, healthMultiplier: 8.4 },
      { enemyId: "voltling", count: 34, intervalMs: 100, healthMultiplier: 8.6 },
    ],
  },
  // 37
  {
    index: 37,
    spawns: [
      { enemyId: "skitterwing", count: 20, intervalMs: 210, healthMultiplier: 9.0 },
      { enemyId: "wraithguard", count: 10, intervalMs: 880, healthMultiplier: 8.8 },
      { enemyId: "runeshell", count: 9, intervalMs: 1150, healthMultiplier: 8.8 },
      { enemyId: "cragback", count: 12, intervalMs: 520, healthMultiplier: 9.0 },
    ],
  },
  // 38
  {
    index: 38,
    spawns: [
      { enemyId: "thornling", count: 22, intervalMs: 160, healthMultiplier: 9.4 },
      { enemyId: "cinderling", count: 20, intervalMs: 200, healthMultiplier: 9.4 },
      { enemyId: "quagbrute", count: 9, intervalMs: 780, healthMultiplier: 9.2 },
      { enemyId: "voltling", count: 36, intervalMs: 95, healthMultiplier: 9.4 },
    ],
  },
  // 39 — final breather / staging wave before the campaign finale boss
  {
    index: 39,
    spawns: [
      { enemyId: "frostfang", count: 20, intervalMs: 210, healthMultiplier: 9.8 },
      { enemyId: "cragback", count: 12, intervalMs: 500, healthMultiplier: 9.8 },
      { enemyId: "wraithguard", count: 11, intervalMs: 850, healthMultiplier: 9.6 },
      { enemyId: "runeshell", count: 10, intervalMs: 1100, healthMultiplier: 9.6 },
      { enemyId: "skitterwing", count: 22, intervalMs: 190, healthMultiplier: 9.8 },
    ],
  },
  // 40 — CAMPAIGN FINALE BOSS: Thal'vor, the Stormbound Sovereign, backed
  // by the largest, most varied escort in the game (7 regular types).
  {
    index: 40,
    spawns: [
      { enemyId: "thornling", count: 18, intervalMs: 150, healthMultiplier: 10.5 },
      { enemyId: "voltling", count: 34, intervalMs: 90, healthMultiplier: 10.5 },
      { enemyId: "cinderling", count: 18, intervalMs: 180, healthMultiplier: 10.8 },
      { enemyId: "wraithguard", count: 9, intervalMs: 800, healthMultiplier: 10.5 },
      { enemyId: "runeshell", count: 8, intervalMs: 1050, healthMultiplier: 10.2 },
      { enemyId: "quagbrute", count: 7, intervalMs: 750, healthMultiplier: 10.5 },
      { enemyId: "cragback", count: 9, intervalMs: 480, healthMultiplier: 10.8 },
    ],
    bossId: "stormsovereign",
  },
];

// The hand-authored campaign, with the difficulty tuning above applied.
export const WAVES: WaveDef[] = RAW_WAVES.map((wave) => ({
  ...wave,
  spawns: wave.spawns.map((s) => ({
    ...s,
    count: Math.max(1, Math.round(s.count * WAVE_SIZE_FACTOR)),
    healthMultiplier:
      s.healthMultiplier !== undefined ? round2(s.healthMultiplier * DIFFICULTY_HEALTH_FACTOR) : undefined,
  })),
}));

// Number of hand-authored campaign waves (the fixed 40-wave story, finale
// boss included). Endless mode picks up procedurally right after this.
export const TOTAL_WAVES: number = WAVES.length;

// ---------------------------------------------------------------------------
// Endless mode — procedurally generated waves past the campaign finale
// ---------------------------------------------------------------------------
// Reuses the same 10 regular enemy ids and cycles the 3 existing bosses
// every 5th endless wave, so no new content is required. Health keeps
// climbing geometrically from wave 40's tuned baseline, composition widens
// a little further, and swarm spacing keeps tightening — the same shape the
// hand-authored curve was already following, just continued indefinitely.
const ENDLESS_ENEMY_IDS = [
  "thornling",
  "voltling",
  "cinderling",
  "cragback",
  "sandveil",
  "frostfang",
  "skitterwing",
  "quagbrute",
  "wraithguard",
  "runeshell",
];
const ENDLESS_BOSS_IDS = ["cindercolossus", "hollowglacier", "stormsovereign"];

const ENDLESS_BASE_HEALTH_MULT = WAVES[WAVES.length - 1]?.spawns[0]?.healthMultiplier ?? 8.2;

function generateEndlessWave(index: number): WaveDef {
  const n = index - TOTAL_WAVES; // 1, 2, 3, ... waves past the campaign
  const healthMultiplier = round2(ENDLESS_BASE_HEALTH_MULT * Math.pow(1.05, n));
  const typeCount = Math.min(ENDLESS_ENEMY_IDS.length, 4 + Math.floor(n / 3));

  const spawns: WaveSpawnEntry[] = [];
  for (let i = 0; i < typeCount; i++) {
    const enemyId = ENDLESS_ENEMY_IDS[(n + i) % ENDLESS_ENEMY_IDS.length];
    const count = Math.max(4, Math.round(((10 + n * 1.3) * WAVE_SIZE_FACTOR) / typeCount + 4));
    const intervalMs = Math.max(70, Math.round(240 - n * 2.5));
    spawns.push({ enemyId, count, intervalMs, healthMultiplier });
  }

  const bossId = n % 5 === 0 ? ENDLESS_BOSS_IDS[(n / 5 - 1) % ENDLESS_BOSS_IDS.length] : undefined;
  return { index, spawns, bossId };
}

/** Looks up a hand-authored wave, or synthesizes one procedurally past the
 * campaign finale (see "Endless mode" above) — the game never runs out of
 * waves. */
export function getWave(index: number): WaveDef | undefined {
  const found = WAVES.find((w) => w.index === index);
  if (found) return found;
  if (index > TOTAL_WAVES) return generateEndlessWave(index);
  return undefined;
}

export interface SpawnOrderEntry {
  enemyId: string;
  /** Milliseconds after the wave starts — relative, not an absolute game
   * timestamp, so this same ordering works both for actually scheduling
   * spawns (Game.ts adds its own elapsed-time offset) and for a read-only
   * "what's coming" preview that has no notion of elapsed time yet. */
  offsetMs: number;
  healthMultiplier: number;
  isBoss?: boolean;
}

/**
 * Single source of truth for "in what order do this wave's enemies
 * actually walk out," used both by Game.ts's real spawn scheduler and by
 * the next-wave preview UI — a wave's `spawns` entries don't spawn one
 * entry fully before the next starts, they interleave by timing (every
 * entry's own count starts ticking from the same t=0), so the true spawn
 * order has to be computed by sorting the merged timeline, not just read
 * off `spawns` in array order.
 */
export function computeSpawnOrder(wave: WaveDef): SpawnOrderEntry[] {
  const queue: SpawnOrderEntry[] = [];
  let latest = 0;
  for (const entry of wave.spawns) {
    for (let i = 0; i < entry.count; i++) {
      const offsetMs = i * entry.intervalMs;
      queue.push({ enemyId: entry.enemyId, offsetMs, healthMultiplier: entry.healthMultiplier ?? 1 });
      latest = Math.max(latest, offsetMs);
    }
  }
  if (wave.bossId) {
    queue.push({ enemyId: wave.bossId, offsetMs: latest + 1500, healthMultiplier: 1, isBoss: true });
  }
  queue.sort((a, b) => a.offsetMs - b.offsetMs);
  return queue;
}
