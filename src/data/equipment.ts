/**
 * Equipment shop definitions. Gold coins dropped by enemies fund purchases.
 * Every item is now a one-shot consumable, so gold stays useful all run long:
 *  - `charge` items (grenade/heal/berserk) add one use to an inventory counter;
 *    pressing Q / E / R spends one. No cooldown — the counter is the limit.
 *  - `buff` items are timed potions: buying applies (or refreshes) a bonus that
 *    expires after `duration` seconds. Re-buying refreshes the timer.
 *  - `shield` stacks "block the next hit" charges, each consumed by one hit.
 */

export type EquipKind = 'charge' | 'buff' | 'shield';

export interface EquipDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Consumable form: charge counter, timed buff, or stacking shield. */
  kind: EquipKind;
  /** Keyboard slot for charge items: Q / E / R. */
  key?: string;
  /** Buff duration in seconds (kind === 'buff' only). */
  duration?: number;
  /** Image asset key shown in the shop and HUD UI. */
  iconKey: string;
  /** Short tooltip shown on the inventory bar. */
  tip: string;
}

export const EQUIPMENT: EquipDef[] = [
  {
    id: 'magnet',
    name: '磁能吸附',
    desc: '60 秒内拾取范围 +60%，经验获取 +15%',
    cost: 20,
    kind: 'buff',
    duration: 60,
    iconKey: 'equip_magnet',
    tip: '60s 拾取+60% 经验+15%',
  },
  {
    id: 'grenade',
    name: '高爆手雷',
    desc: '对 180px 范围敌人造成 120 伤害（每次购买 +1 枚）',
    cost: 12,
    kind: 'charge',
    key: 'KeyQ',
    iconKey: 'equip_grenade',
    tip: '范围爆破 120伤',
  },
  {
    id: 'heal',
    name: '急救包',
    desc: '立即回复 40 生命值（每次购买 +1 个）',
    cost: 8,
    kind: 'charge',
    key: 'KeyE',
    iconKey: 'equip_medkit',
    tip: '回复40HP',
  },
  {
    id: 'shield',
    name: '护盾发生器',
    desc: '生成一面护盾抵挡一次伤害（每次购买 +1 层，可叠加）',
    cost: 18,
    kind: 'shield',
    iconKey: 'equip_shield',
    tip: '免伤一次',
  },
  {
    id: 'boots',
    name: '疾风战靴',
    desc: '45 秒内移动速度 +18%、全伤害 +20%',
    cost: 22,
    kind: 'buff',
    duration: 45,
    iconKey: 'equip_boots',
    tip: '45s 移速+18% 伤害+20%',
  },
  {
    id: 'berserk',
    name: '狂暴药剂',
    desc: '5 秒内伤害 +80%、攻速 +30%（每次购买 +1 瓶）',
    cost: 14,
    kind: 'charge',
    key: 'KeyR',
    iconKey: 'equip_berserk',
    tip: '5s狂暴',
  },
  {
    id: 'coinDouble',
    name: '金币倍增',
    desc: '60 秒内金币掉落量翻倍',
    cost: 25,
    kind: 'buff',
    duration: 60,
    iconKey: 'equip_coin_double',
    tip: '60s 金币×2',
  },
  {
    id: 'deathDance',
    name: '死亡之舞',
    desc: '30 秒内每次击杀 +5% 伤害（上限 +50%，到期清空）',
    cost: 28,
    kind: 'buff',
    duration: 30,
    iconKey: 'equip_death_dance',
    tip: '30s 击杀叠伤 +5%',
  },
];

/** Base coin drop per enemy type. A small ±20 % jitter is added at drop time. */
export const COIN_DROP: Record<string, number> = {
  walker: 2,
  runner: 3,
  spitter: 5,
  exploder: 4,
  brute: 10,
  boss: 50,
};

/** Maximum death-dance kill stacks (×5 % each = 50 % cap). */
export const DEATH_DANCE_CAP = 10;
