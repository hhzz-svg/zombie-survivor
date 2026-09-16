import { z } from 'zod';
import { EnemyDefSchema, type EnemyDef } from './schemas';
import { tr } from '../i18n';

// Validated at module load — bad data throws immediately instead of failing mysteriously mid-game.
const raw = [
  { id: 'walker',   name: tr('行尸', 'Walker'),     behavior: 'walker',   hp: 12,   speed: 46,  contactDmg: 8,  radius: 11, color: '#7a9a5b', xp: 1,   cost: 1,   isBoss: false },
  { id: 'runner',   name: tr('疾跑者', 'Runner'),   behavior: 'runner',   hp: 7,    speed: 122, contactDmg: 6,  radius: 9,  color: '#c9a23f', xp: 2,   cost: 2,   isBoss: false },
  { id: 'spitter',  name: tr('喷吐者', 'Spitter'),   behavior: 'spitter',  hp: 22,   speed: 38,  contactDmg: 6,  radius: 12, color: '#6fc36f', xp: 5,   cost: 6,   isBoss: false },
  { id: 'exploder', name: tr('自爆体', 'Bomber'),   behavior: 'exploder', hp: 16,   speed: 74,  contactDmg: 30, radius: 13, color: '#d46a9f', xp: 4,   cost: 5,   isBoss: false },
  { id: 'brute',    name: tr('壮汉', 'Brute'),     behavior: 'brute',    hp: 150,  speed: 32,  contactDmg: 24, radius: 20, color: '#b5552f', xp: 8,   cost: 10,  isBoss: false },
  // Pressure archetypes: each one punishes a habit instead of just walking at you.
  { id: 'warden',   name: tr('盾卫', 'Warden'),     behavior: 'warden',   hp: 120,  speed: 52,  contactDmg: 18, radius: 16, color: '#6f7f93', xp: 9,   cost: 9,   isBoss: false, sprite: 'brute' },
  { id: 'brood',    name: tr('孵化体', 'Brooder'),   behavior: 'brood',    hp: 170,  speed: 30,  contactDmg: 10, radius: 18, color: '#9a6fc3', xp: 14,  cost: 12,  isBoss: false, sprite: 'spitter' },
  { id: 'lasher',   name: tr('钩刺者', 'Lasher'),   behavior: 'lasher',   hp: 40,   speed: 64,  contactDmg: 8,  radius: 12, color: '#d98a3f', xp: 7,   cost: 7,   isBoss: false, sprite: 'runner' },
  { id: 'golden',   name: tr('黄金逃亡者', 'Golden Runner'), behavior: 'golden', hp: 46,   speed: 148, contactDmg: 0,  radius: 10, color: '#ffd700', xp: 10,  cost: 999, isBoss: false },
  { id: 'boss',     name: tr('母巢暴君', 'Hive Tyrant'), behavior: 'boss',     hp: 5200, speed: 42,  contactDmg: 42, radius: 46, color: '#9b3b6a', xp: 250, cost: 999, isBoss: true },
  // A siege piece rather than a chaser: it barely moves, but it takes the ground away.
  { id: 'siege',    name: tr('腐蚀母株', 'Rotting Matriarch'), behavior: 'siege',    hp: 4600, speed: 22,  contactDmg: 38, radius: 44, color: '#6fae3f', xp: 250, cost: 999, isBoss: true, sprite: 'boss' },
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
/**
 * Total width of the shield's frontal arc, in degrees. This is the number to tune: getting
 * outside it is what "flank the warden" means, so it decides how far around the player has
 * to travel — and therefore how much horde they have to cross to do it.
 */
export const WARDEN_ARC_DEGREES = 100;
/**
 * Threshold for `travelDirection · facing` in `damageEnemy`. Derived, never hand-written:
 * the two disagreed for three days (a literal -0.28 is a 147° arc, not the 100° the comment
 * claimed) because the sign flip is easy to get wrong. A shot travels *into* the warden, so
 * it arrives from dead ahead when that dot product is -1 — hence the negated cosine, and
 * hence "blocked" being the *lower* side of the comparison.
 */
export const WARDEN_ARC_COS = -Math.cos((WARDEN_ARC_DEGREES / 2) * (Math.PI / 180));
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
 * Wardens are what stops the player simply walking out of the acid.
 *
 * These two were briefly softened (9.5s / 0.35) to close what looked like a three-to-one
 * difficulty gap against the tyrant. That gap was a measurement artifact: the harness capped
 * runs at 300s against a boss that arrives at 240s, so "slow to kill" was being scored as
 * "lost". Splitting the failures showed the matriarch kills the player once in twenty fights,
 * exactly as often as the tyrant does — she was never the more lethal boss, and softening her
 * was aimed at a problem that did not exist. Reverted to the designed values.
 */
export const SIEGE_SUMMON_INTERVAL = 7;
/** Fraction of max HP at which it enrages. Same threshold as the tyrant. */
export const SIEGE_ENRAGE_AT = 0.5;
export const ACID_POOL_SECONDS = 6;
export const ACID_POOL_DPS = 9;
