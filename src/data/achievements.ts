import { tr } from '../i18n';
/**
 * Achievements: every run makes progress somewhere, win or lose. Checks run
 * against a plain snapshot so they are pure and unit-testable; persistence
 * (localStorage) lives in the Game layer, never in systems or the sim.
 */

/** Everything an achievement check may look at. */
export interface AchieveSnapshot {
  // per-run
  time: number;
  kills: number;
  maxCombo: number;
  elites: number;
  crates: number;
  golden: number;
  tyrants: number;
  stage: number;
  gold: number;
  victory: boolean;
  evolved: boolean;
  curse: number;
  firstHpHitAt: number | null;
  rescued: number; // survivors rescued this run
  squadNow: number; // wingmen alive right now
  // lifetime totals (updated at run end; 0 during a run)
  totalKills: number;
  totalRuns: number;
  totalWins: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (s: AchieveSnapshot) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'kills-50', name: tr('猎杀新手', 'Novice Hunter'), desc: tr('单局击杀 50 只感染体', 'Kill 50 infected in a single run'), check: (s) => s.kills >= 50 },
  { id: 'kills-500', name: tr('割草机', 'Lawnmower'), desc: tr('单局击杀 500 只感染体', 'Kill 500 infected in a single run'), check: (s) => s.kills >= 500 },
  { id: 'kills-1500', name: tr('行尸终结者', 'Ender of Walkers'), desc: tr('单局击杀 1500 只感染体', 'Kill 1500 infected in a single run'), check: (s) => s.kills >= 1500 },
  { id: 'combo-25', name: tr('杀戮链', 'Kill Chain'), desc: tr('单局连击达到 25', 'Reach a 25 combo in a single run'), check: (s) => s.maxCombo >= 25 },
  { id: 'combo-60', name: tr('狂热引擎', 'Frenzy Engine'), desc: tr('单局连击达到 60', 'Reach a 60 combo in a single run'), check: (s) => s.maxCombo >= 60 },
  { id: 'combo-120', name: tr('灭世节拍', 'Apocalypse Beat'), desc: tr('单局连击达到 120', 'Reach a 120 combo in a single run'), check: (s) => s.maxCombo >= 120 },
  { id: 'elite-5', name: tr('精英猎手', 'Elite Hunter'), desc: tr('单局击破 5 只词缀精英', 'Break 5 affix elites in a single run'), check: (s) => s.elites >= 5 },
  { id: 'elite-20', name: tr('变异清除者', 'Mutation Purge'), desc: tr('单局击破 20 只词缀精英', 'Break 20 affix elites in a single run'), check: (s) => s.elites >= 20 },
  { id: 'golden-1', name: tr('黄金猎手', 'Gold Rush'), desc: tr('在黄金逃亡者跑掉之前干掉它', 'Kill a Golden Runner before it escapes'), check: (s) => s.golden >= 1 },
  { id: 'crates-3', name: tr('空投常客', 'Frequent Flyer'), desc: tr('单局回收 3 箱空投补给', 'Recover 3 supply drops in a single run'), check: (s) => s.crates >= 3 },
  { id: 'stage-5', name: tr('深入母巢', 'Into the Hive'), desc: tr('抵达第 5 阶段', 'Reach stage 5'), check: (s) => s.stage >= 5 },
  { id: 'gold-1000', name: tr('战地富豪', 'War Profiteer'), desc: tr('单局持有 1000 金币', 'Hold 1000 gold in a single run'), check: (s) => s.gold >= 1000 },
  { id: 'evolved', name: tr('终极形态', 'Final Form'), desc: tr('完成一次武器进化', 'Complete a weapon evolution'), check: (s) => s.evolved },
  { id: 'untouched-60', name: tr('零接触', 'Untouched'), desc: tr('开局 60 秒未受真实伤害', 'Take no real damage in the first 60 seconds'), check: (s) => s.time >= 60 && (s.firstHpHitAt === null || s.firstHpHitAt >= 60) },
  { id: 'curse-3', name: tr('逆天而行', 'Against the Odds'), desc: tr('单局接受 3 层血怨诅咒', 'Accept 3 blood-curse stacks in a single run'), check: (s) => s.curse >= 3 },
  { id: 'rescue-1', name: tr('不抛弃', 'No One Left'), desc: tr('救援 1 名幸存者入队', 'Rescue a survivor into your squad'), check: (s) => s.rescued >= 1 },
  { id: 'squad-2', name: tr('完整编队', 'Full Squad'), desc: tr('同时拥有 2 名活着的僚机', 'Have 2 wingmen alive at once'), check: (s) => s.squadNow >= 2 },
  { id: 'victory', name: tr('清道夫', 'Scavenger'), desc: tr('击败母巢暴君', 'Defeat the Hive Tyrant'), check: (s) => s.victory },
  { id: 'tyrant-3', name: tr('弑君者', 'Kingslayer'), desc: tr('无尽尸潮中单局斩杀 3 尊回归暴君', 'Slay 3 returning tyrants in one endless run'), check: (s) => s.tyrants >= 3 },
  { id: 'life-kills-5000', name: tr('万骨枯', 'Bonefield'), desc: tr('累计击杀 5000 只感染体', 'Kill 5000 infected in total'), check: (s) => s.totalKills >= 5000 },
  { id: 'life-runs-10', name: tr('老兵', 'Veteran'), desc: tr('累计出击 10 局', 'Complete 10 runs in total'), check: (s) => s.totalRuns >= 10 },
  { id: 'life-wins-3', name: tr('母巢克星', 'Hivebane'), desc: tr('累计击败母巢暴君 3 次', 'Defeat the Hive Tyrant 3 times in total'), check: (s) => s.totalWins >= 3 },
];

/** Returns definitions newly satisfied by `s` that are not in `unlocked`. */
export function evaluateAchievements(s: AchieveSnapshot, unlocked: ReadonlySet<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.check(s));
}
