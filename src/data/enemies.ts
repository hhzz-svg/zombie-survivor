import { z } from 'zod';
import { EnemyDefSchema, type EnemyDef } from './schemas';

// Validated at module load — bad data throws immediately instead of failing mysteriously mid-game.
const raw = [
  { id: 'walker',   name: '行尸',     behavior: 'walker',   hp: 12,   speed: 46,  contactDmg: 8,  radius: 11, color: '#7a9a5b', xp: 1,   cost: 1,   isBoss: false },
  { id: 'runner',   name: '疾跑者',   behavior: 'runner',   hp: 7,    speed: 122, contactDmg: 6,  radius: 9,  color: '#c9a23f', xp: 2,   cost: 2,   isBoss: false },
  { id: 'spitter',  name: '喷吐者',   behavior: 'spitter',  hp: 22,   speed: 38,  contactDmg: 6,  radius: 12, color: '#6fc36f', xp: 5,   cost: 6,   isBoss: false },
  { id: 'exploder', name: '自爆体',   behavior: 'exploder', hp: 16,   speed: 74,  contactDmg: 30, radius: 13, color: '#d46a9f', xp: 4,   cost: 5,   isBoss: false },
  { id: 'brute',    name: '壮汉',     behavior: 'brute',    hp: 150,  speed: 32,  contactDmg: 24, radius: 20, color: '#b5552f', xp: 8,   cost: 10,  isBoss: false },
  { id: 'boss',     name: '母巢暴君', behavior: 'boss',     hp: 5200, speed: 42,  contactDmg: 42, radius: 46, color: '#9b3b6a', xp: 250, cost: 999, isBoss: true },
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
];
