import { tr } from '../i18n';
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
    name: tr('磁能吸附', 'Magnetic Field'),
    desc: tr('60 秒内拾取范围 +60%，经验获取 +15%', '+60% pickup range and +15% XP for 60 seconds'),
    cost: 20,
    kind: 'buff',
    duration: 60,
    iconKey: 'equip_magnet',
    tip: tr('60s 拾取+60% 经验+15%', '60s · +60% pickup · +15% XP'),
  },
  {
    id: 'grenade',
    name: tr('高爆手雷', 'Frag Grenade'),
    desc: tr('对 180px 范围敌人造成 120 伤害（每次购买 +1 枚）', 'Deal 120 damage in a 180px radius (+1 per purchase)'),
    cost: 12,
    kind: 'charge',
    key: 'KeyQ',
    iconKey: 'equip_grenade',
    tip: tr('范围爆破 120伤', 'Blast · 120 dmg'),
  },
  {
    id: 'heal',
    name: tr('急救包', 'Medkit'),
    desc: tr('立即回复 40 生命值（每次购买 +1 个）', 'Restore 40 HP instantly (+1 per purchase)'),
    cost: 8,
    kind: 'charge',
    key: 'KeyE',
    iconKey: 'equip_medkit',
    tip: tr('回复40HP', 'Heal 40 HP'),
  },
  {
    id: 'shield',
    name: tr('护盾发生器', 'Shield Generator'),
    desc: tr('生成一面护盾抵挡一次伤害（每次购买 +1 层，可叠加）', 'Absorb one hit (+1 stacking layer per purchase)'),
    cost: 18,
    kind: 'shield',
    iconKey: 'equip_shield',
    tip: tr('免伤一次', 'Blocks one hit'),
  },
  {
    id: 'boots',
    name: tr('疾风战靴', 'Windrunner Boots'),
    desc: tr('45 秒内移动速度 +18%、全伤害 +20%', '+18% move speed and +20% damage for 45 seconds'),
    cost: 22,
    kind: 'buff',
    duration: 45,
    iconKey: 'equip_boots',
    tip: tr('45s 移速+18% 伤害+20%', '45s · +18% speed · +20% dmg'),
  },
  {
    id: 'berserk',
    name: tr('狂暴药剂', 'Berserk Serum'),
    desc: tr('5 秒内伤害 +80%、攻速 +30%（每次购买 +1 瓶）', '+80% damage and +30% fire rate for 5 seconds (+1 per purchase)'),
    cost: 14,
    kind: 'charge',
    key: 'KeyR',
    iconKey: 'equip_berserk',
    tip: tr('5s狂暴', '5s berserk'),
  },
  {
    id: 'coinDouble',
    name: tr('金币倍增', 'Gold Multiplier'),
    desc: tr('60 秒内金币掉落量翻倍', 'Double gold drops for 60 seconds'),
    cost: 25,
    kind: 'buff',
    duration: 60,
    iconKey: 'equip_coin_double',
    tip: tr('60s 金币×2', '60s · gold ×2'),
  },
  {
    id: 'deathDance',
    name: tr('死亡之舞', 'Death Dance'),
    desc: tr('30 秒内每次击杀 +5% 伤害（上限 +50%，到期清空）', '+5% damage per kill for 30 seconds (caps at +50%, resets on expiry)'),
    cost: 28,
    kind: 'buff',
    duration: 30,
    iconKey: 'equip_death_dance',
    tip: tr('30s 击杀叠伤 +5%', '30s · +5% dmg per kill'),
  },
];

/** Base coin drop per enemy type. A small ±20 % jitter is added at drop time. */
export const COIN_DROP: Record<string, number> = {
  walker: 2,
  runner: 3,
  spitter: 5,
  exploder: 4,
  brute: 10,
  golden: 6, // plus the on-death coin fountain
  boss: 50,
};

/** Maximum death-dance kill stacks (×5 % each = 50 % cap). */
export const DEATH_DANCE_CAP = 10;
