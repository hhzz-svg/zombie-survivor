import { describe, expect, it } from 'vitest';
import { makeCtx, freshStats } from './helpers';
import { OPERATIVES, operativeById, applyOperative, DEFAULT_OPERATIVE } from '../src/data/operatives';
import { WEAPONS } from '../src/data/weapons';
import { createPlayer } from '../src/factory';
import { Health, Loadout } from '../src/components';

describe('operatives', () => {
  it('ships three distinct operatives with valid starting weapons', () => {
    expect(OPERATIVES).toHaveLength(3);
    for (const op of OPERATIVES) {
      expect(WEAPONS[op.weapon]).toBeDefined();
    }
    expect(new Set(OPERATIVES.map((o) => o.weapon)).size).toBe(3);
  });

  it('falls back to the first operative for unknown ids', () => {
    expect(operativeById('nope').id).toBe(OPERATIVES[0]!.id);
    expect(operativeById(DEFAULT_OPERATIVE).id).toBe(DEFAULT_OPERATIVE);
  });

  it('juggernaut trades speed for hp', () => {
    const base = freshStats();
    const stats = applyOperative(freshStats(), operativeById('juggernaut'));
    expect(stats.maxHp).toBe(base.maxHp + 40);
    expect(stats.moveSpeed).toBeCloseTo(base.moveSpeed * 0.92);
  });

  it('hunter gains crit and speed but loses hp', () => {
    const base = freshStats();
    const stats = applyOperative(freshStats(), operativeById('hunter'));
    expect(stats.crit).toBeCloseTo(base.crit + 0.15);
    expect(stats.maxHp).toBe(base.maxHp - 20);
    expect(stats.moveSpeed).toBeGreaterThan(base.moveSpeed);
  });

  it('createPlayer starts with the operative weapon and matching max hp', () => {
    const ctx = makeCtx();
    const op = operativeById('juggernaut');
    applyOperative(ctx.stats, op);
    const player = createPlayer(ctx, op.weapon);
    const lo = ctx.world.get(player, Loadout)!;
    expect(lo.weapons[0]!.def.id).toBe('shotgun');
    expect(lo.activeWeapon).toBe('shotgun');
    expect(ctx.world.get(player, Health)!.max).toBe(ctx.stats.maxHp);
  });
});
