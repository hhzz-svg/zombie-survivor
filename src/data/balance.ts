import { WaveConfigSchema, type WaveConfig } from './schemas';

/** Player base stats before any upgrades. */
export const PLAYER_BASE = {
  maxHp: 100,
  moveSpeed: 172,
  radius: 12,
  pickupRange: 48,
};

/** XP needed to go from `level` to `level+1`. Grows so late levels feel earned. */
export function xpToNext(level: number): number {
  return Math.floor(5 + level * 4 + level * level * 0.7);
}

/** Difficulty scalars over a run. */
export function hpScale(t: number): number {
  return 1 + t / 140; // smoothed from /100 — gives more breathing room
}
export function speedScale(t: number): number {
  return 1 + t / 320;
}

export interface RunStage {
  index: number;
  name: string;
  from: number;
  hordeCap: number;
  spawnMul: number;
}

export const RUN_STAGES: readonly RunStage[] = [
  { index: 1, name: 'Outbreak', from: 0, hordeCap: 80, spawnMul: 0.72 },
  { index: 2, name: 'Street Swarm', from: 60, hordeCap: 140, spawnMul: 0.95 },
  { index: 3, name: 'Night Push', from: 120, hordeCap: 220, spawnMul: 1.18 },
  { index: 4, name: 'Hive Breach', from: 180, hordeCap: 320, spawnMul: 1.38 },
  { index: 5, name: 'Tyrant Arrival', from: 225, hordeCap: 420, spawnMul: 1.55 },
];

export function currentRunStage(t: number): RunStage {
  let stage = RUN_STAGES[0]!;
  for (const s of RUN_STAGES) {
    if (t >= s.from) stage = s;
    else break;
  }
  return stage;
}

export function hordeCapAt(t: number): number {
  return currentRunStage(t).hordeCap;
}

export function spawnRateMulAt(t: number): number {
  return currentRunStage(t).spawnMul;
}

export const WAVE: WaveConfig = WaveConfigSchema.parse({
  baseRate: 1.8,
  ratePerSec: 0.075,
  cap: 420,
  bossAt: 240,
  spawnRadius: 560,
});

/** Victory = survive to the boss and kill it. */
export const RUN_GOAL_SECONDS = WAVE.bossAt;

// ---------------------------------------------------------------------------
// Kill combo: chained kills within the window climb tiers that boost XP/gold.

export const COMBO_WINDOW = 4;

export interface ComboTier {
  at: number; // combo count at which the tier starts
  name: string;
  xpMul: number;
  goldMul: number;
  color: string;
}

export const COMBO_TIERS: readonly ComboTier[] = [
  { at: 0, name: '', xpMul: 1, goldMul: 1, color: '#9ab1aa' },
  { at: 10, name: '连击', xpMul: 1.1, goldMul: 1, color: '#61e5de' },
  { at: 25, name: '杀戮', xpMul: 1.25, goldMul: 1.1, color: '#ffd166' },
  { at: 50, name: '狂热', xpMul: 1.5, goldMul: 1.2, color: '#ff9f43' },
  { at: 100, name: '灭世', xpMul: 2, goldMul: 1.35, color: '#ff5252' },
];

// ---------------------------------------------------------------------------
// Blood-moon surges: short spawn storms with boosted gold. Fixed windows keep
// the sim deterministic and let the HUD warn ahead of time.

export const SURGES: ReadonlyArray<{ at: number; duration: number }> = [
  { at: 95, duration: 14 },
  { at: 165, duration: 16 },
];
export const SURGE_WARN_SECONDS = 4;
export const SURGE_SPAWN_MUL = 2.3;
export const SURGE_GOLD_MUL = 1.6;
export const SURGE_SPEED_MUL = 1.12;

// Past the scripted list the moon keeps rising on a fixed cycle, so endless
// runs (t > 240) never run out of storms. Pure functions of t keep it
// deterministic and warnable.
const SURGE_CYCLE_FROM = 300;
const SURGE_CYCLE_EVERY = 150;
const SURGE_CYCLE_DURATION = 16;

export function activeSurge(t: number): { at: number; duration: number } | null {
  const listed = SURGES.find((s) => t >= s.at && t < s.at + s.duration);
  if (listed) return listed;
  if (t >= SURGE_CYCLE_FROM) {
    const k = Math.floor((t - SURGE_CYCLE_FROM) / SURGE_CYCLE_EVERY);
    const at = SURGE_CYCLE_FROM + k * SURGE_CYCLE_EVERY;
    if (t < at + SURGE_CYCLE_DURATION) return { at, duration: SURGE_CYCLE_DURATION };
  }
  return null;
}

export function incomingSurge(t: number): { at: number; duration: number } | null {
  const listed = SURGES.find((s) => t >= s.at - SURGE_WARN_SECONDS && t < s.at);
  if (listed) return listed;
  if (t >= SURGE_CYCLE_FROM - SURGE_WARN_SECONDS) {
    const k = Math.max(0, Math.ceil((t - SURGE_CYCLE_FROM) / SURGE_CYCLE_EVERY));
    const at = SURGE_CYCLE_FROM + k * SURGE_CYCLE_EVERY;
    if (t >= at - SURGE_WARN_SECONDS && t < at) return { at, duration: SURGE_CYCLE_DURATION };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Supply drops: a crate parachutes in near the player on a fixed cadence.

export const SUPPLY_FIRST_AT = 35;
export const SUPPLY_INTERVAL = 42;
export const SUPPLY_FALL_SECONDS = 2;
export const SUPPLY_PICKUP_RADIUS = 34;

// ---------------------------------------------------------------------------
// Elites: affix-carrying variants that start rolling after ELITE_FROM seconds.

export const ELITE_FROM = 50;

export function eliteChance(t: number): number {
  if (t < ELITE_FROM) return 0;
  return Math.min(0.12, 0.04 + (t - ELITE_FROM) * 0.0004);
}

// ---------------------------------------------------------------------------
// Endless mode: after victory the run continues and tyrants keep coming back.

export const ENDLESS_BOSS_INTERVAL = 110;
export const ENDLESS_BOSS_HP_MUL = 1.45; // compounding per respawn cycle
