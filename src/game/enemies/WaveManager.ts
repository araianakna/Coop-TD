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

import type { WaveDef } from "@/game/types";

export const WAVES: WaveDef[] = [
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
];

export function getWave(index: number): WaveDef | undefined {
  return WAVES.find((w) => w.index === index);
}

export const TOTAL_WAVES: number = WAVES.length;
