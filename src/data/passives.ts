import { z } from 'zod';
import { PassiveDefSchema, type PassiveDef } from './schemas';
import { tr } from '../i18n';

/**
 * The passive pool. Every entry is capped at MAX_PASSIVE_LEVEL and `amount` is the step
 * gained per level, so "+20% 伤害" reads as "+20% per level, five levels available".
 *
 * `kind: 'trait'` entries change how combat behaves rather than moving a number — they are
 * what stops a build from being "whichever card shows the bigger digit".
 */
export const PASSIVES: PassiveDef[] = z.array(PassiveDefSchema).parse([
  { id: 'pow',    name: tr('高能弹头', 'High-Yield Rounds'), desc: tr('+20% 伤害', '+20% damage'),    stat: 'damageMul',   amount: 0.2 },
  { id: 'rof',    name: tr('快速循环', 'Rapid Cycling'), desc: tr('+18% 攻速', '+18% fire rate'),    stat: 'fireRateMul', amount: 0.18 },
  { id: 'legs',   name: tr('轻量护具', 'Light Armor'), desc: tr('+12% 移速', '+12% move speed'),    stat: 'moveSpeed',   amount: 0.12 },
  { id: 'vest',   name: tr('防弹背心', 'Ballistic Vest'), desc: tr('+25 最大生命', '+25 max HP'), stat: 'maxHp',       amount: 25 },
  { id: 'ap',     name: tr('穿甲弹', 'Armor-Piercing'),   desc: tr('+1 穿透', '+1 pierce'),      stat: 'pierce',      amount: 1 },
  { id: 'magnet', name: tr('磁能拾取', 'Magnetic Pickup'), desc: tr('+40% 拾取范围', '+40% pickup range'), stat: 'magnet',      amount: 0.4 },
  { id: 'multi',  name: tr('多重射击', 'Multishot'), desc: tr('+1 弹丸', '+1 projectile'),      stat: 'projectiles', amount: 1 },
  { id: 'crit',   name: tr('暴击', 'Critical Strike'),     desc: tr('+10% 暴击率', '+10% crit chance'),  stat: 'crit',        amount: 0.1 },
  { id: 'vamp',   name: tr('嗜血', 'Bloodthirst'),     desc: tr('击杀回 2 生命', 'Heal 2 HP per kill'), stat: 'lifesteal',   amount: 2 },
  // Traits — behaviour, not numbers.
  { id: 'detonate',  name: tr('尸爆', 'Corpse Detonation'),   desc: tr('击杀有 18% 概率引爆尸体（60 伤害）', '18% chance a kill detonates the corpse (60 damage)'), stat: 'detonate',  amount: 0.18, kind: 'trait' },
  { id: 'chill',     name: tr('冻伤', 'Frostbite'),   desc: tr('命中使敌人减速 12%，持续 1.2 秒', 'Hits slow enemies by 12% for 1.2s'),    stat: 'chill',     amount: 0.12, kind: 'trait' },
  { id: 'desperate', name: tr('背水', 'Last Stand'),   desc: tr('生命低于 40% 时伤害 +15%', '+15% damage below 40% HP'),           stat: 'desperate', amount: 0.15, kind: 'trait' },
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
