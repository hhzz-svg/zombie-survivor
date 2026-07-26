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
  { id: 'kills-50', name: '猎杀新手', desc: '单局击杀 50 只感染体', check: (s) => s.kills >= 50 },
  { id: 'kills-500', name: '割草机', desc: '单局击杀 500 只感染体', check: (s) => s.kills >= 500 },
  { id: 'kills-1500', name: '行尸终结者', desc: '单局击杀 1500 只感染体', check: (s) => s.kills >= 1500 },
  { id: 'combo-25', name: '杀戮链', desc: '单局连击达到 25', check: (s) => s.maxCombo >= 25 },
  { id: 'combo-60', name: '狂热引擎', desc: '单局连击达到 60', check: (s) => s.maxCombo >= 60 },
  { id: 'combo-120', name: '灭世节拍', desc: '单局连击达到 120', check: (s) => s.maxCombo >= 120 },
  { id: 'elite-5', name: '精英猎手', desc: '单局击破 5 只词缀精英', check: (s) => s.elites >= 5 },
  { id: 'elite-20', name: '变异清除者', desc: '单局击破 20 只词缀精英', check: (s) => s.elites >= 20 },
  { id: 'golden-1', name: '黄金猎手', desc: '在黄金逃亡者跑掉之前干掉它', check: (s) => s.golden >= 1 },
  { id: 'crates-3', name: '空投常客', desc: '单局回收 3 箱空投补给', check: (s) => s.crates >= 3 },
  { id: 'stage-5', name: '深入母巢', desc: '抵达第 5 阶段', check: (s) => s.stage >= 5 },
  { id: 'gold-1000', name: '战地富豪', desc: '单局持有 1000 金币', check: (s) => s.gold >= 1000 },
  { id: 'evolved', name: '终极形态', desc: '完成一次武器进化', check: (s) => s.evolved },
  { id: 'untouched-60', name: '零接触', desc: '开局 60 秒未受真实伤害', check: (s) => s.time >= 60 && (s.firstHpHitAt === null || s.firstHpHitAt >= 60) },
  { id: 'curse-3', name: '逆天而行', desc: '单局接受 3 层血怨诅咒', check: (s) => s.curse >= 3 },
  { id: 'victory', name: '清道夫', desc: '击败母巢暴君', check: (s) => s.victory },
  { id: 'tyrant-3', name: '弑君者', desc: '无尽尸潮中单局斩杀 3 尊回归暴君', check: (s) => s.tyrants >= 3 },
  { id: 'life-kills-5000', name: '万骨枯', desc: '累计击杀 5000 只感染体', check: (s) => s.totalKills >= 5000 },
  { id: 'life-runs-10', name: '老兵', desc: '累计出击 10 局', check: (s) => s.totalRuns >= 10 },
  { id: 'life-wins-3', name: '母巢克星', desc: '累计击败母巢暴君 3 次', check: (s) => s.totalWins >= 3 },
];

/** Returns definitions newly satisfied by `s` that are not in `unlocked`. */
export function evaluateAchievements(s: AchieveSnapshot, unlocked: ReadonlySet<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.check(s));
}
