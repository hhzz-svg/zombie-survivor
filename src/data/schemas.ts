import { z } from 'zod';

/**
 * Single source of truth for game data shapes. The game loads & validates content against
 * these at startup; the (future) MCP server and headless sim import the SAME schemas, so
 * AI-generated content and runtime content can never drift apart.
 */

export const EnemyDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  behavior: z.enum(['walker', 'runner', 'brute', 'spitter', 'exploder', 'boss', 'golden']),
  hp: z.number().positive(),
  speed: z.number().nonnegative(),
  contactDmg: z.number().nonnegative(),
  radius: z.number().positive(),
  color: z.string(),
  xp: z.number().nonnegative(),
  cost: z.number().positive(),
  isBoss: z.boolean(),
});
export type EnemyDef = z.infer<typeof EnemyDefSchema>;

export const WeaponDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['aim', 'nova', 'orbit']),
  cooldown: z.number().positive(), // seconds between shots
  damage: z.number().nonnegative(),
  projectiles: z.number().int().positive(),
  speed: z.number().nonnegative(), // bullet speed px/s
  pierce: z.number().int().nonnegative(),
  spread: z.number().nonnegative(), // total spread in radians
  range: z.number().nonnegative(), // nova radius
  knockback: z.number().nonnegative(),
  life: z.number().positive(), // bullet lifetime seconds
  sprite: z.string().optional(), // manifest key for sprite image
  bulletStyle: z.enum(['flame', 'rocket']).optional(), // non-default projectile rendering
  explodeRadius: z.number().positive().optional(), // splash radius on hit (rockets)
});
export type WeaponDef = z.infer<typeof WeaponDefSchema>;

export const OperativeDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  desc: z.string(),
  weapon: z.string(), // starting weapon id
  spriteKey: z.string(), // title-screen card art (manifest key)
  perk: z.string(), // human-readable stat line
  mods: z.object({
    maxHp: z.number().optional(),
    moveSpeedMul: z.number().optional(),
    fireRateMul: z.number().optional(),
    crit: z.number().optional(),
    damageMul: z.number().optional(),
  }),
});
export type OperativeDef = z.infer<typeof OperativeDefSchema>;

export const PassiveDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  stat: z.enum(['damageMul', 'fireRateMul', 'moveSpeed', 'maxHp', 'pierce', 'magnet', 'projectiles', 'crit', 'lifesteal']),
  amount: z.number(),
});
export type PassiveDef = z.infer<typeof PassiveDefSchema>;

export const SkillDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  cost: z.number().positive(),
  unlockStage: z.number().int().positive(),
  cooldown: z.number().positive(),
  key: z.string(),
  iconKey: z.string(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

export const WaveConfigSchema = z.object({
  baseRate: z.number().nonnegative(), // base spawn budget per second
  ratePerSec: z.number().nonnegative(), // budget growth per elapsed second
  cap: z.number().int().positive(), // max alive enemies
  bossAt: z.number().positive(), // seconds until boss
  spawnRadius: z.number().positive(), // ring radius around player to spawn at
});
export type WaveConfig = z.infer<typeof WaveConfigSchema>;
