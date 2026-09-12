import { z } from 'zod';
import { PassiveDefSchema, type PassiveDef } from './schemas';

/**
 * The passive pool. Every entry is capped at MAX_PASSIVE_LEVEL and `amount` is the step
 * gained per level, so "+20% 伤害" reads as "+20% per level, five levels available".
 *
 * `kind: 'trait'` entries change how combat behaves rather than moving a number — they are
 * what stops a build from being "whichever card shows the bigger digit".
 */
export const PASSIVES: PassiveDef[] = z.array(PassiveDefSchema).parse([
  { id: 'pow',    name: '高能弹头', desc: '+20% 伤害',    stat: 'damageMul',   amount: 0.2 },
  { id: 'rof',    name: '快速循环', desc: '+18% 攻速',    stat: 'fireRateMul', amount: 0.18 },
  { id: 'legs',   name: '轻量护具', desc: '+12% 移速',    stat: 'moveSpeed',   amount: 0.12 },
  { id: 'vest',   name: '防弹背心', desc: '+25 最大生命', stat: 'maxHp',       amount: 25 },
  { id: 'ap',     name: '穿甲弹',   desc: '+1 穿透',      stat: 'pierce',      amount: 1 },
  { id: 'magnet', name: '磁能拾取', desc: '+40% 拾取范围', stat: 'magnet',      amount: 0.4 },
  { id: 'multi',  name: '多重射击', desc: '+1 弹丸',      stat: 'projectiles', amount: 1 },
  { id: 'crit',   name: '暴击',     desc: '+10% 暴击率',  stat: 'crit',        amount: 0.1 },
  { id: 'vamp',   name: '嗜血',     desc: '击杀回 2 生命', stat: 'lifesteal',   amount: 2 },
  // Traits — behaviour, not numbers.
  { id: 'detonate',  name: '尸爆',   desc: '击杀有 18% 概率引爆尸体（60 伤害）', stat: 'detonate',  amount: 0.18, kind: 'trait' },
  { id: 'chill',     name: '冻伤',   desc: '命中使敌人减速 12%，持续 1.2 秒',    stat: 'chill',     amount: 0.12, kind: 'trait' },
  { id: 'desperate', name: '背水',   desc: '生命低于 40% 时伤害 +15%',           stat: 'desperate', amount: 0.15, kind: 'trait' },
]);

/** Trait tuning shared by the combat hooks. */
export const DETONATE_DAMAGE = 60;
export const DETONATE_RADIUS = 70;
export const CHILL_SECONDS = 1.2;
/** Chill never removes more than this much of an enemy's speed, however many levels are stacked. */
export const CHILL_CAP = 0.55;

export function passiveById(id: string): PassiveDef | undefined {
  return PASSIVES.find((p) => p.id === id);
}
