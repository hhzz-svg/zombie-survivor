import { describe, expect, it } from 'vitest';
import { freshStats } from './helpers';
import {
  OPERATIVES, operativeById, OP_LEVEL_CAP,
  opXpToNext, opLevelFromXp, opXpGain, applyOperativeLevel, opLevelBonusText,
} from '../src/data/operatives';

describe('operative veterancy', () => {
  it('every operative defines a level perk', () => {
    for (const op of OPERATIVES) {
      expect(op.levelPerk.amount).toBeGreaterThan(0);
      expect(op.levelPerk.label.length).toBeGreaterThan(0);
    }
  });

  it('xp curve resolves levels with progress and caps out', () => {
    expect(opLevelFromXp(0)).toEqual({ level: 1, into: 0, next: 100 });
    expect(opLevelFromXp(99)).toEqual({ level: 1, into: 99, next: 100 });
    expect(opLevelFromXp(100)).toEqual({ level: 2, into: 0, next: 160 });
    expect(opLevelFromXp(100 + 160)).toEqual({ level: 3, into: 0, next: opXpToNext(3) });
    const atCap = opLevelFromXp(1e9);
    expect(atCap.level).toBe(OP_LEVEL_CAP);
    expect(atCap.next).toBe(0); // no further goal at cap
  });

  it('run xp pays out for kills, time, elites, tyrants, and victory', () => {
    expect(opXpGain({ kills: 0, time: 0, victory: false, elites: 0, tyrants: 0 })).toBe(0);
    expect(opXpGain({ kills: 200, time: 240, victory: true, elites: 10, tyrants: 0 }))
      .toBe(100 + 60 + 120 + 20);
    expect(opXpGain({ kills: 100, time: 100, victory: false, elites: 0, tyrants: 2 }))
      .toBe(50 + 25 + 80);
  });

  it('level bonuses land on each operative signature stat', () => {
    const ranger = applyOperativeLevel(freshStats(), operativeById('ranger'), 5);
    expect(ranger.fireRateMul).toBeCloseTo(1 + 0.02 * 4);

    const jug = applyOperativeLevel(freshStats(), operativeById('juggernaut'), 5);
    expect(jug.maxHp).toBe(100 + 6 * 4);

    const hunter = applyOperativeLevel(freshStats(), operativeById('hunter'), 5);
    expect(hunter.crit).toBeCloseTo(0.012 * 4);
  });

  it('level 1 adds nothing and levels never exceed the cap', () => {
    const base = applyOperativeLevel(freshStats(), operativeById('ranger'), 1);
    expect(base.fireRateMul).toBe(1);
    const over = applyOperativeLevel(freshStats(), operativeById('ranger'), 99);
    expect(over.fireRateMul).toBeCloseTo(1 + 0.02 * (OP_LEVEL_CAP - 1));
  });

  it('bonus text tracks the current level', () => {
    expect(opLevelBonusText(operativeById('ranger'), 1)).toBe('尚无老兵加成');
    expect(opLevelBonusText(operativeById('ranger'), 6)).toContain('10%');
    expect(opLevelBonusText(operativeById('juggernaut'), 3)).toContain('12');
  });
});
