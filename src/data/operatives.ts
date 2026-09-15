import { z } from 'zod';
import { OperativeDefSchema, type OperativeDef } from './schemas';
import { tr } from '../i18n';

/**
 * Playable operatives: each starts with a different weapon and stat spread so
 * runs open differently. Mods are applied once to the fresh PlayerStats.
 */
const raw = [
  {
    id: 'ranger',
    name: tr('游侠', 'Ranger'),
    title: tr('均衡机动', 'Balanced Mobility'),
    desc: tr('标准装备的清道夫，进攻节奏快，怎么打都顺手。', 'A standard-issue scavenger with a fast offensive rhythm — comfortable in any fight.'),
    weapon: 'pistol',
    spriteKey: 'player_pistol',
    perk: tr('+12% 攻速', '+12% fire rate'),
    mods: { fireRateMul: 0.12 },
    levelPerk: { stat: 'fireRateMul', amount: 0.02, label: tr('每级 +2% 攻速', '+2% fire rate per level') },
  },
  {
    id: 'juggernaut',
    name: tr('重装', 'Juggernaut'),
    title: tr('钢铁防线', 'Iron Line'),
    desc: tr('扛住第一波压力，用霰弹在近距离轰开缺口。', 'Soaks the first wave, then blasts an opening at point-blank range.'),
    weapon: 'shotgun',
    spriteKey: 'player_shotgun',
    perk: tr('+40 生命 · -8% 移速', '+40 HP · -8% move speed'),
    mods: { maxHp: 40, moveSpeedMul: -0.08 },
    levelPerk: { stat: 'maxHp', amount: 6, label: tr('每级 +6 生命', '+6 HP per level') },
  },
  {
    id: 'hunter',
    name: tr('猎手', 'Hunter'),
    title: tr('一击必杀', 'One Shot, One Kill'),
    desc: tr('高风险高回报，用重弹和暴击精准点名精英。', 'High risk, high reward: heavy rounds and crits to pick elites off precisely.'),
    weapon: 'magnum',
    spriteKey: 'player_magnum',
    perk: tr('+15% 暴击 · +8% 移速 · -20 生命', '+15% crit · +8% move speed · -20 HP'),
    mods: { crit: 0.15, moveSpeedMul: 0.08, maxHp: -20 },
    levelPerk: { stat: 'crit', amount: 0.012, label: tr('每级 +1.2% 暴击', '+1.2% crit per level') },
  },
];

export const OPERATIVES: readonly OperativeDef[] = z.array(OperativeDefSchema).parse(raw);

export const DEFAULT_OPERATIVE = 'ranger';

export function operativeById(id: string): OperativeDef {
  return OPERATIVES.find((o) => o.id === id) ?? OPERATIVES[0];
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

// ---------------------------------------------------------------------------
// Veterancy: operatives keep XP across runs and grow their signature stat.

export const OP_LEVEL_CAP = 10;

/** XP needed to advance FROM `level` to the next one. */
export function opXpToNext(level: number): number {
  return 100 + (level - 1) * 60;
}

/** Resolve total accumulated XP into a level plus progress toward the next. */
export function opLevelFromXp(totalXp: number): { level: number; into: number; next: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (level < OP_LEVEL_CAP && rest >= opXpToNext(level)) {
    rest -= opXpToNext(level);
    level++;
  }
  return { level, into: rest, next: level >= OP_LEVEL_CAP ? 0 : opXpToNext(level) };
}

/** XP earned by a run — every run pays out, victories and elite hunts pay more. */
export function opXpGain(s: {
  kills: number; time: number; victory: boolean; elites: number; tyrants: number;
}): number {
  return Math.round(s.kills * 0.5 + s.time * 0.25 + s.elites * 2 + s.tyrants * 40 + (s.victory ? 120 : 0));
}

/** Apply veterancy growth for `level` (level 1 = no bonus). Mutates and returns stats. */
export function applyOperativeLevel<T extends {
  maxHp: number; fireRateMul: number; crit: number;
}>(stats: T, op: OperativeDef, level: number): T {
  const steps = Math.max(0, Math.min(OP_LEVEL_CAP, level) - 1);
  if (steps === 0) return stats;
  const perk = op.levelPerk;
  if (perk.stat === 'maxHp') stats.maxHp += perk.amount * steps;
  else if (perk.stat === 'fireRateMul') stats.fireRateMul += perk.amount * steps;
  else stats.crit += perk.amount * steps;
  return stats;
}

/** Human-readable current bonus, e.g. "+8% 攻速". */
export function opLevelBonusText(op: OperativeDef, level: number): string {
  const steps = Math.max(0, Math.min(OP_LEVEL_CAP, level) - 1);
  if (steps === 0) return tr('尚无老兵加成', 'No veterancy bonus yet');
  const perk = op.levelPerk;
  const total = perk.amount * steps;
  if (perk.stat === 'maxHp') return tr(`老兵加成 +${Math.round(total)} 生命`, `Veterancy +${Math.round(total)} HP`);
  if (perk.stat === 'fireRateMul') return tr(`老兵加成 +${Math.round(total * 100)}% 攻速`, `Veterancy +${Math.round(total * 100)}% fire rate`);
  return tr(`老兵加成 +${(total * 100).toFixed(1)}% 暴击`, `Veterancy +${(total * 100).toFixed(1)}% crit`);
}
