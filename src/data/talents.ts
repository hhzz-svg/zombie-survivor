import { tr } from '../i18n';
/**
 * Permanent upgrades bought with salvage, the meta currency a run banks whether it wins or
 * loses. This is the layer the game was missing: without it a defeat left nothing behind
 * except a number on the title screen, so there was no reason for the next run to feel
 * different from the last one.
 *
 * Everything here is pure data plus pure functions over a `{ id: level }` map — persistence
 * and the UI live elsewhere, and the simulation only ever sees the resolved effects.
 */

export type TalentBranch = 'kit' | 'arms' | 'survival';

export interface TalentDef {
  id: string;
  branch: TalentBranch;
  name: string;
  desc: string; // per-level effect, human readable
  maxLevel: number;
  /** Cost of each level, index 0 = first level. */
  costs: readonly number[];
  /** Must own this talent at `reqLevel` first — branches unlock in order. */
  requires?: { id: string; level: number };
  /** Must have unlocked this achievement. Ties the achievement wall to actual unlocks. */
  requiresAchievement?: { id: string; label: string };
}

export const BRANCH_NAMES: Record<TalentBranch, string> = {
  kit: tr('战备', 'Loadout'),
  arms: tr('火力', 'Firepower'),
  survival: tr('生存', 'Survival'),
};

export const BRANCH_BLURB: Record<TalentBranch, string> = {
  kit: tr('开局就带着的东西', 'What you walk in with'),
  arms: tr('每一发子弹的重量', 'The weight behind every round'),
  survival: tr('把「快死了」变成「还能打」', 'Turning "about to die" into "still fighting"'),
};

export const TALENTS: readonly TalentDef[] = [
  // --- 战备 ---------------------------------------------------------------
  {
    id: 'vanguard', branch: 'kit', name: tr('前哨补给', 'Outpost Supplies'), desc: tr('起始生命 +10', '+10 starting HP'),
    maxLevel: 5, costs: [30, 55, 90, 140, 210],
  },
  {
    id: 'plating', branch: 'kit', name: tr('复合装甲', 'Composite Plating'), desc: tr('开局携带 1 层护盾', 'Start with 1 shield layer'),
    maxLevel: 3, costs: [70, 130, 220], requires: { id: 'vanguard', level: 1 },
  },
  {
    id: 'warchest', branch: 'kit', name: tr('战备金库', 'War Chest'), desc: tr('开局携带 25 金币', 'Start with 25 gold'),
    maxLevel: 4, costs: [50, 90, 150, 230], requires: { id: 'plating', level: 1 },
  },

  // --- 火力 ---------------------------------------------------------------
  {
    id: 'caliber', branch: 'arms', name: tr('口径升级', 'Caliber Upgrade'), desc: tr('全武器伤害 +6%', '+6% damage on all weapons'),
    maxLevel: 5, costs: [35, 65, 105, 160, 240],
  },
  {
    id: 'marksman', branch: 'arms', name: tr('神射手', 'Marksman'), desc: tr('暴击率 +3%', '+3% crit chance'),
    maxLevel: 4, costs: [60, 110, 180, 280], requires: { id: 'caliber', level: 1 },
  },
  {
    id: 'refit', branch: 'arms', name: tr('改装工坊', 'Refit Workshop'), desc: tr('武器进化所需的被动等级 -1', 'Weapon evolutions need one less passive level'),
    maxLevel: 1, costs: [400], requires: { id: 'marksman', level: 2 },
    requiresAchievement: { id: 'evolved', label: tr('终极形态 · 完成一次武器进化', 'Final Form · complete a weapon evolution') },
  },

  // --- 生存 ---------------------------------------------------------------
  {
    id: 'scavenger', branch: 'survival', name: tr('拾荒者', 'Scrounger'), desc: tr('拾取范围 +15%', '+15% pickup range'),
    maxLevel: 4, costs: [30, 55, 90, 140],
  },
  {
    id: 'secondwind', branch: 'survival', name: tr('第二次呼吸', 'Second Wind'), desc: tr('肾上腺素每局可触发 2 次', 'Adrenaline can trigger twice per run'),
    maxLevel: 1, costs: [260], requires: { id: 'scavenger', level: 2 },
  },
  {
    id: 'revive', branch: 'survival', name: tr('复活协议', 'Revival Protocol'), desc: tr('每局一次：倒下时原地复活，回复 50% 生命', 'Once per run: revive on the spot at 50% HP'),
    maxLevel: 1, costs: [500], requires: { id: 'secondwind', level: 1 },
    requiresAchievement: { id: 'victory', label: tr('清道夫 · 击败母巢暴君', 'Scavenger · defeat the Hive Tyrant') },
  },
];

export type TalentLevels = Readonly<Record<string, number>>;

export function talentById(id: string): TalentDef | undefined {
  return TALENTS.find((t) => t.id === id);
}

export function levelOf(levels: TalentLevels, id: string): number {
  return levels[id] ?? 0;
}

/** Cost of the next level, or null when it is already maxed. */
export function nextCost(def: TalentDef, levels: TalentLevels): number | null {
  const lv = levelOf(levels, def.id);
  return lv >= def.maxLevel ? null : def.costs[lv];
}

export type LockReason =
  | { kind: 'ok' }
  | { kind: 'maxed' }
  | { kind: 'requires'; text: string }
  | { kind: 'achievement'; text: string }
  | { kind: 'salvage'; short: number };

/** Why this talent can or cannot be bought right now. */
export function buyState(
  def: TalentDef,
  levels: TalentLevels,
  salvage: number,
  unlockedAchievements: ReadonlySet<string>,
): LockReason {
  const cost = nextCost(def, levels);
  if (cost === null) return { kind: 'maxed' };
  if (def.requires && levelOf(levels, def.requires.id) < def.requires.level) {
    const req = talentById(def.requires.id);
    return { kind: 'requires', text: tr(`需要 ${req?.name ?? def.requires.id} Lv.${def.requires.level}`, `Requires ${req?.name ?? def.requires.id} Lv.${def.requires.level}`) };
  }
  if (def.requiresAchievement && !unlockedAchievements.has(def.requiresAchievement.id)) {
    return { kind: 'achievement', text: tr(`需要成就：${def.requiresAchievement.label}`, `Requires achievement: ${def.requiresAchievement.label}`) };
  }
  if (salvage < cost) return { kind: 'salvage', short: cost - salvage };
  return { kind: 'ok' };
}

/** Total salvage sunk into the tree — what a full refund pays back. */
export function totalSpent(levels: TalentLevels): number {
  let sum = 0;
  for (const def of TALENTS) {
    const lv = levelOf(levels, def.id);
    for (let i = 0; i < lv; i++) sum += def.costs[i];
  }
  return sum;
}

/** Resolved effects the run actually applies. Pure function of the owned levels. */
export interface TalentEffects {
  bonusMaxHp: number;
  damageMul: number; // additive into stats.damageMul
  crit: number;
  magnet: number;
  startShield: number;
  startGold: number;
  evoDiscount: number; // passive levels shaved off every evolution recipe
  adrenalineCharges: number;
  revives: number;
}

export function talentEffects(levels: TalentLevels): TalentEffects {
  return {
    bonusMaxHp: levelOf(levels, 'vanguard') * 10,
    damageMul: levelOf(levels, 'caliber') * 0.06,
    crit: levelOf(levels, 'marksman') * 0.03,
    magnet: levelOf(levels, 'scavenger') * 0.15,
    startShield: levelOf(levels, 'plating'),
    startGold: levelOf(levels, 'warchest') * 25,
    evoDiscount: levelOf(levels, 'refit'),
    adrenalineCharges: 1 + levelOf(levels, 'secondwind'),
    revives: levelOf(levels, 'revive'),
  };
}

/** The zero state — used for the daily challenge, where permanent power is switched off. */
export const NO_TALENTS: TalentEffects = talentEffects({});

// ---------------------------------------------------------------------------
// Salvage: banked by every run, win or lose.

export function salvageGain(s: {
  time: number;
  goldLeft: number;
  elites: number;
  tyrants: number;
  victory: boolean;
}): number {
  return Math.round(
    s.time * 0.15 + s.goldLeft * 0.25 + s.elites * 3 + s.tyrants * 60 + (s.victory ? 100 : 0),
  );
}

/** Fold resolved effects into freshly-built player stats (mutates and returns them). */
export function applyTalents<T extends {
  maxHp: number; damageMul: number; crit: number; magnet: number; evoDiscount: number;
}>(stats: T, fx: TalentEffects): T {
  stats.maxHp += fx.bonusMaxHp;
  stats.damageMul += fx.damageMul;
  stats.crit += fx.crit;
  stats.magnet += fx.magnet;
  stats.evoDiscount += fx.evoDiscount;
  return stats;
}
