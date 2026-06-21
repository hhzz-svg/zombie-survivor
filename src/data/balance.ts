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

export const WAVE: WaveConfig = WaveConfigSchema.parse({
  baseRate: 1.8,
  ratePerSec: 0.075,
  cap: 420,
  bossAt: 240,
  spawnRadius: 560,
});

/** Victory = survive to the boss and kill it. */
export const RUN_GOAL_SECONDS = WAVE.bossAt;
