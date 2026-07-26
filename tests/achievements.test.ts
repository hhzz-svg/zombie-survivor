import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, evaluateAchievements, type AchieveSnapshot } from '../src/data/achievements';

function snap(over: Partial<AchieveSnapshot> = {}): AchieveSnapshot {
  return {
    time: 0, kills: 0, maxCombo: 0, elites: 0, crates: 0, golden: 0, tyrants: 0,
    stage: 1, gold: 0, victory: false, evolved: false, curse: 0, firstHpHitAt: null,
    totalKills: 0, totalRuns: 0, totalWins: 0,
    ...over,
  };
}

describe('achievements', () => {
  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('a fresh snapshot unlocks nothing', () => {
    expect(evaluateAchievements(snap(), new Set())).toHaveLength(0);
  });

  it('kill milestones unlock in order and never re-unlock', () => {
    const unlocked = new Set<string>();
    const first = evaluateAchievements(snap({ kills: 60 }), unlocked);
    expect(first.map((a) => a.id)).toEqual(['kills-50']);
    first.forEach((a) => unlocked.add(a.id));

    const second = evaluateAchievements(snap({ kills: 600 }), unlocked);
    expect(second.map((a) => a.id)).toEqual(['kills-500']);
    second.forEach((a) => unlocked.add(a.id));

    expect(evaluateAchievements(snap({ kills: 600 }), unlocked)).toHaveLength(0);
  });

  it('untouched-60 needs a full clean minute', () => {
    const ids = (s: AchieveSnapshot) => evaluateAchievements(s, new Set()).map((a) => a.id);
    expect(ids(snap({ time: 59.9 }))).not.toContain('untouched-60');
    expect(ids(snap({ time: 61 }))).toContain('untouched-60');
    expect(ids(snap({ time: 61, firstHpHitAt: 30 }))).not.toContain('untouched-60');
    expect(ids(snap({ time: 61, firstHpHitAt: 60 }))).toContain('untouched-60');
  });

  it('run and lifetime goals evaluate side by side', () => {
    const got = evaluateAchievements(
      snap({ maxCombo: 130, curse: 3, victory: true, totalKills: 5000, totalWins: 3, totalRuns: 10 }),
      new Set(),
    ).map((a) => a.id);
    for (const id of ['combo-25', 'combo-60', 'combo-120', 'curse-3', 'victory', 'life-kills-5000', 'life-wins-3', 'life-runs-10']) {
      expect(got).toContain(id);
    }
  });
});
