import { z } from 'zod';
import { OperativeDefSchema, type OperativeDef } from './schemas';

/**
 * Playable operatives: each starts with a different weapon and stat spread so
 * runs open differently. Mods are applied once to the fresh PlayerStats.
 */
const raw = [
  {
    id: 'ranger',
    name: '游侠',
    title: '均衡机动',
    desc: '标准装备的清道夫，进攻节奏快，怎么打都顺手。',
    weapon: 'pistol',
    spriteKey: 'player_pistol',
    perk: '+12% 攻速',
    mods: { fireRateMul: 0.12 },
  },
  {
    id: 'juggernaut',
    name: '重装',
    title: '钢铁防线',
    desc: '扛住第一波压力，用霰弹在近距离轰开缺口。',
    weapon: 'shotgun',
    spriteKey: 'player_shotgun',
    perk: '+40 生命 · -8% 移速',
    mods: { maxHp: 40, moveSpeedMul: -0.08 },
  },
  {
    id: 'hunter',
    name: '猎手',
    title: '一击必杀',
    desc: '高风险高回报，用重弹和暴击精准点名精英。',
    weapon: 'magnum',
    spriteKey: 'player_magnum',
    perk: '+15% 暴击 · +8% 移速 · -20 生命',
    mods: { crit: 0.15, moveSpeedMul: 0.08, maxHp: -20 },
  },
];

export const OPERATIVES: readonly OperativeDef[] = z.array(OperativeDefSchema).parse(raw);

export const DEFAULT_OPERATIVE = 'ranger';

export function operativeById(id: string): OperativeDef {
  return OPERATIVES.find((o) => o.id === id) ?? OPERATIVES[0]!;
}

/** Apply an operative's mods to freshly-built base stats (mutates and returns them). */
export function applyOperative<T extends {
  maxHp: number; moveSpeed: number; fireRateMul: number; crit: number; damageMul: number;
}>(stats: T, op: OperativeDef): T {
  const m = op.mods;
  if (m.maxHp) stats.maxHp = Math.max(40, stats.maxHp + m.maxHp);
  if (m.moveSpeedMul) stats.moveSpeed *= 1 + m.moveSpeedMul;
  if (m.fireRateMul) stats.fireRateMul += m.fireRateMul;
  if (m.crit) stats.crit += m.crit;
  if (m.damageMul) stats.damageMul += m.damageMul;
  return stats;
}
