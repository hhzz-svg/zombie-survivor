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
