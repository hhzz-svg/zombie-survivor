import { describe, it, expect } from 'vitest';
import { makeCtx } from './helpers';
import { makeChoices, applyChoice, choiceKey, type Choice } from '../src/progression';
import { rerollCost, banishCost, MAX_PASSIVE_LEVEL } from '../src/data/balance';
import { WEAPONS, MAX_WEAPON_LEVEL, EVOLUTIONS } from '../src/data/weapons';
import { passiveById, PASSIVES } from '../src/data/passives';
import { Loadout } from '../src/components';
import type { GameContext } from '../src/ctx';

function grant(ctx: GameContext, id: string, times: number): void {
  const p = passiveById(id)!;
  for (let i = 0; i < times; i++) applyChoice(ctx, { kind: 'passive', passive: p, label: '', desc: '' });
}

describe('prices', () => {
  it('rerolls get steadily dearer, so shaping an offer is never free', () => {
    expect(rerollCost(0)).toBeLessThan(rerollCost(1));
    expect(rerollCost(1) - rerollCost(0)).toBe(rerollCost(5) - rerollCost(4)); // linear
  });

  it('banishes compound, so emptying the whole pool stays out of reach', () => {
    expect(banishCost(1) / banishCost(0)).toBeGreaterThan(1.5);
    expect(banishCost(6)).toBeGreaterThan(banishCost(0) * 20);
  });
});

describe('choiceKey', () => {
  it('keys a weapon by the weapon, so banishing an upgrade banishes the weapon', () => {
    const asNew: Choice = { kind: 'weapon-new', weapon: WEAPONS['nova']!, label: '', desc: '' };
    const asUp: Choice = { kind: 'weapon-up', weaponId: 'nova', label: '', desc: '' };
    expect(choiceKey(asNew)).toBe(choiceKey(asUp));
  });

  it('refuses to key evolutions and consolation bonuses — they cannot be banished', () => {
    expect(choiceKey({ kind: 'weapon-evo', weaponId: 'pistol', evoId: 'pistol-evo', label: '', desc: '' })).toBeNull();
    expect(choiceKey({ kind: 'bonus', bonus: 'gold', label: '', desc: '' })).toBeNull();
  });
});

describe('banishing', () => {
  it('keeps a banished subject out of every later offer', () => {
    const ctx = makeCtx();
    ctx.run.banished.add('w:nova');
    ctx.run.banished.add('p:crit');

    for (let i = 0; i < 60; i++) {
      for (const c of makeChoices(ctx)) {
        expect(choiceKey(c)).not.toBe('w:nova');
        expect(choiceKey(c)).not.toBe('p:crit');
      }
    }
  });

  it('leaves the surviving cards on the table and replaces only the banished one', () => {
    const ctx = makeCtx();
    const before = makeChoices(ctx);
    const kept = before.filter((_, j) => j !== 0);
    ctx.run.banished.add(choiceKey(before[0]!)!);

    const after = makeChoices(ctx, kept);

    expect(after).toHaveLength(3);
    expect(after).toEqual(expect.arrayContaining(kept));
    // The replacement is genuinely new, not a duplicate of what is already shown.
    const keys = after.map(choiceKey).filter((k): k is string => k !== null);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('raises the odds of the card you are building toward — the entire point', () => {
    const rate = (ctx: GameContext) => {
      let seen = 0;
      for (let i = 0; i < 200; i++) {
        if (makeChoices(ctx).some((c) => choiceKey(c) === 'p:pow')) seen++;
      }
      return seen / 200;
    };

    const plain = makeCtx();
    const before = rate(plain);

    const banished = makeCtx();
    for (const p of PASSIVES) if (p.id !== 'pow') banished.run.banished.add(`p:${p.id}`);
    for (const id of Object.keys(WEAPONS)) if (id !== 'pistol') banished.run.banished.add(`w:${id}`);
    const after = rate(banished);

    expect(after).toBeGreaterThan(before * 2);
  });

  it('still returns three offers when almost everything is banished', () => {
    const ctx = makeCtx();
    for (const id of Object.keys(WEAPONS)) ctx.run.banished.add(`w:${id}`);
    for (const p of PASSIVES) ctx.run.banished.add(`p:${p.id}`);
    expect(makeChoices(ctx)).toHaveLength(3);
  });

  it('cannot remove a ready evolution from the first slot', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    lo.weapons[0]!.level = MAX_WEAPON_LEVEL;
    grant(ctx, EVOLUTIONS['pistol']!.passive, EVOLUTIONS['pistol']!.passiveLevel);
    ctx.run.banished.add('w:pistol'); // banishing the weapon must not hide its evolution

    const choices = makeChoices(ctx);

    expect(choices[0]!.kind).toBe('weapon-evo');
  });

  it('a banished passive stops climbing even if already owned', () => {
    const ctx = makeCtx();
    grant(ctx, 'vamp', 1);
    ctx.run.banished.add('p:vamp');
    expect(ctx.passives.get('vamp')).toBe(1);
    for (let i = 0; i < 40; i++) {
      expect(makeChoices(ctx).some((c) => c.kind === 'passive-up' && c.passiveId === 'vamp')).toBe(false);
    }
    expect(MAX_PASSIVE_LEVEL).toBeGreaterThan(1); // it could have climbed; the banish is why it did not
  });
});
