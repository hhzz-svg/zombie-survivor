import { z } from 'zod';
import { EnemyDefSchema, type EnemyDef } from './schemas';

// Validated at module load — bad data throws immediately instead of failing mysteriously mid-game.
const raw = [
  { id: 'walker',   name: '行尸',     behavior: 'walker',   hp: 12,   speed: 46,  contactDmg: 8,  radius: 11, color: '#7a9a5b', xp: 1,   cost: 1,   isBoss: false },
  { id: 'runner',   name: '疾跑者',   behavior: 'runner',   hp: 7,    speed: 122, contactDmg: 6,  radius: 9,  color: '#c9a23f', xp: 2,   cost: 2,   isBoss: false },
  { id: 'spitter',  name: '喷吐者',   behavior: 'spitter',  hp: 22,   speed: 38,  contactDmg: 6,  radius: 12, color: '#6fc36f', xp: 5,   cost: 6,   isBoss: false },
  { id: 'exploder', name: '自爆体',   behavior: 'exploder', hp: 16,   speed: 74,  contactDmg: 30, radius: 13, color: '#d46a9f', xp: 4,   cost: 5,   isBoss: false },
  { id: 'brute',    name: '壮汉',     behavior: 'brute',    hp: 150,  speed: 32,  contactDmg: 24, radius: 20, color: '#b5552f', xp: 8,   cost: 10,  isBoss: false },
  // Pressure archetypes: each one punishes a habit instead of just walking at you.
  { id: 'warden',   name: '盾卫',     behavior: 'warden',   hp: 120,  speed: 52,  contactDmg: 18, radius: 16, color: '#6f7f93', xp: 9,   cost: 9,   isBoss: false, sprite: 'brute' },
  { id: 'brood',    name: '孵化体',   behavior: 'brood',    hp: 170,  speed: 30,  contactDmg: 10, radius: 18, color: '#9a6fc3', xp: 14,  cost: 12,  isBoss: false, sprite: 'spitter' },
  { id: 'lasher',   name: '钩刺者',   behavior: 'lasher',   hp: 40,   speed: 64,  contactDmg: 8,  radius: 12, color: '#d98a3f', xp: 7,   cost: 7,   isBoss: false, sprite: 'runner' },
  { id: 'golden',   name: '黄金逃亡者', behavior: 'golden', hp: 46,   speed: 148, contactDmg: 0,  radius: 10, color: '#ffd700', xp: 10,  cost: 999, isBoss: false },
  { id: 'boss',     name: '母巢暴君', behavior: 'boss',     hp: 5200, speed: 42,  contactDmg: 42, radius: 46, color: '#9b3b6a', xp: 250, cost: 999, isBoss: true },
  // A siege piece rather than a chaser: it barely moves, but it takes the ground away.
  { id: 'siege',    name: '腐蚀母株', behavior: 'siege',    hp: 4600, speed: 22,  contactDmg: 38, radius: 44, color: '#6fae3f', xp: 250, cost: 999, isBoss: true, sprite: 'boss' },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(
  z.array(EnemyDefSchema).parse(raw).map((e) => [e.id, e] as const),
);

/** Enemies the director may roll, with a time gate (seconds) before each unlocks. */
export const SPAWN_TABLE: ReadonlyArray<{ id: string; from: number; weight: number }> = [
  { id: 'walker',   from: 0,   weight: 60 },
  { id: 'runner',   from: 25,  weight: 30 },
  { id: 'spitter',  from: 55,  weight: 16 },
  { id: 'exploder', from: 80,  weight: 14 },
  { id: 'brute',    from: 110, weight: 8 },
  { id: 'warden',   from: 95,  weight: 11 },
  { id: 'lasher',   from: 150, weight: 10 },
  { id: 'brood',    from: 130, weight: 6 },
];

// --- Pressure-archetype tuning ---------------------------------------------

/** Damage a warden's shield lets through when hit inside its frontal arc. */
export const WARDEN_FRONT_MUL = 0.18;
/** cos of the half-angle covered by the shield (≈ 100° total). */
export const WARDEN_ARC_COS = -0.28;
/** Radians per second the shield can swing — slow enough that flanking works. */
export const WARDEN_TURN_RATE = 2.1;

export const BROOD_INTERVAL = 5.5;
export const BROOD_LITTER = 2;

export const LASHER_MIN_RANGE = 210;
export const LASHER_MAX_RANGE = 420;
export const LASHER_INTERVAL = 5;
export const LASHER_WINDUP = 0.75;
export const LASHER_PULL = 170;
export const LASHER_DAMAGE = 12;

/** How long the tyrant's ground slam is telegraphed before it lands. */
export const BOSS_SLAM_WINDUP = 0.6;

// --- Corrosion Matriarch (siege boss) ---------------------------------------
// It denies ground instead of chasing: shells land where you are heading, and what they leave
// behind stays. The counter is to keep taking new ground, which walks you into what it summoned.

export const SIEGE_BARRAGE_INTERVAL = 4.2;
export const SIEGE_BARRAGE_WINDUP = 0.95; // generous: the whole point is that it is dodgeable
export const SIEGE_SHELLS = 3;
export const SIEGE_SHELLS_ENRAGED = 5;
export const SIEGE_SHELL_RADIUS = 92;
export const SIEGE_SHELL_DAMAGE = 18;
/** How far ahead of the player shells are aimed — it leads the target, so standing still loses. */
export const SIEGE_LEAD = 105; // slightly more than one blast radius, so the shells read as a line
/**
 * Wardens are what stops the player simply walking out of the acid, so this interval is the
 * dial on how much the two halves of the fight compound. At 7s the matriarch killed three
 * times as often as the tyrant (20% vs 61% kill rate over 120 measured runs), and it was the
 * stacking rather than any single element that did it.
 */
export const SIEGE_SUMMON_INTERVAL = 9.5;
/** Fraction of max HP at which it enrages — later than the tyrant, so the hardest phase is shorter. */
export const SIEGE_ENRAGE_AT = 0.35;
export const ACID_POOL_SECONDS = 6;
export const ACID_POOL_DPS = 9;
