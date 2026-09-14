import { describe, it, expect } from 'vitest';
import { makeCtx } from './helpers';
import { makeChoices, applyChoice } from '../src/progression';
import { WEAPONS, MAX_WEAPON_LEVEL, EVOLUTIONS, evolutionReady } from '../src/data/weapons';
import { WEAPON_SLOTS, PASSIVE_SLOTS, MAX_PASSIVE_LEVEL } from '../src/data/balance';
import { PASSIVES, passiveById } from '../src/data/passives';
import { Loadout } from '../src/components';
import type { GameContext } from '../src/ctx';

/** Fill the loadout up to `n` weapons (the starter pistol already occupies slot 1). */
function fillWeapons(ctx: GameContext, ids: string[]): void {
  const lo = ctx.world.get(ctx.player, Loadout)!;
  for (const id of ids) {
    if (lo.weapons.some((w) => w.def.id === id)) continue;
    lo.weapons.push({ def: WEAPONS[id], level: 1, cd: 0 });
  }
}

function grant(ctx: GameContext, passiveId: string, times: number): void {
  const p = passiveById(passiveId)!;
  for (let i = 0; i < times; i++) {
    applyChoice(ctx, { kind: 'passive', passive: p, label: '', desc: '' });
  }
}

describe('build slots', () => {
  it('stops offering new weapons once every slot is taken', () => {
    const ctx = makeCtx();
    fillWeapons(ctx, ['shotgun', 'smg', 'magnum', 'nova', 'orbit']);
    expect(ctx.world.get(ctx.player, Loadout)!.weapons.length).toBe(WEAPON_SLOTS);
    for (let i = 0; i < 20; i++) {
      expect(makeChoices(ctx).some((c) => c.kind === 'weapon-new')).toBe(false);
    }
  });

  it('stops offering new passives once every slot is taken', () => {
    const ctx = makeCtx();
    for (const p of PASSIVES.slice(0, PASSIVE_SLOTS)) grant(ctx, p.id, 1);
    expect(ctx.passives.size).toBe(PASSIVE_SLOTS);
    for (let i = 0; i < 20; i++) {
      expect(makeChoices(ctx).some((c) => c.kind === 'passive')).toBe(false);
    }
  });

  it('caps a passive at MAX_PASSIVE_LEVEL and applies exactly one step per level', () => {
    const ctx = makeCtx();
    const before = ctx.stats.damageMul;
    grant(ctx, 'pow', MAX_PASSIVE_LEVEL);
    expect(ctx.passives.get('pow')).toBe(MAX_PASSIVE_LEVEL);
    expect(ctx.stats.damageMul).toBeCloseTo(before + 0.2 * MAX_PASSIVE_LEVEL);
    for (let i = 0; i < 20; i++) {
      expect(makeChoices(ctx).some((c) => c.kind === 'passive-up' && c.passiveId === 'pow')).toBe(false);
    }
  });

  it('never offers an evolved weapon as a brand-new pickup', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 40; i++) {
      for (const c of makeChoices(ctx)) {
        if (c.kind === 'weapon-new') expect(c.weapon.id.endsWith('-evo')).toBe(false);
      }
    }
  });
});

describe('evolution recipes', () => {
  it('needs the weapon maxed AND the paired passive at its required level', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    const recipe = EVOLUTIONS['pistol'];

    lo.weapons[0].level = MAX_WEAPON_LEVEL;
    expect(evolutionReady('pistol', MAX_WEAPON_LEVEL, ctx.passives)).toBe(false);
    for (let i = 0; i < 10; i++) {
      expect(makeChoices(ctx).some((c) => c.kind === 'weapon-evo')).toBe(false);
    }

    grant(ctx, recipe.passive, recipe.passiveLevel);
    expect(evolutionReady('pistol', MAX_WEAPON_LEVEL, ctx.passives)).toBe(true);
  });

  it('forces the evolution into the first card so it cannot be rolled away', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    lo.weapons[0].level = MAX_WEAPON_LEVEL;
    grant(ctx, EVOLUTIONS['pistol'].passive, EVOLUTIONS['pistol'].passiveLevel);

    for (let i = 0; i < 10; i++) {
      const choices = makeChoices(ctx);
      expect(choices[0].kind).toBe('weapon-evo');
    }

    const evo = makeChoices(ctx)[0];
    applyChoice(ctx, evo);
    expect(lo.weapons[0].def.id).toBe('pistol-evo');
    expect(lo.weapons[0].level).toBe(1);
    expect(ctx.run.evolved).toBe(true);
  });

  it('an evolved weapon never re-enters the evolution pool', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    lo.weapons[0] = { def: WEAPONS['pistol-evo'], level: MAX_WEAPON_LEVEL, cd: 0 };
    grant(ctx, 'rof', MAX_PASSIVE_LEVEL);
    for (let i = 0; i < 10; i++) {
      expect(makeChoices(ctx).some((c) => c.kind === 'weapon-evo')).toBe(false);
    }
  });
});

describe('offer fallback', () => {
  it('always returns three offers, even with every slot full and maxed', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    fillWeapons(ctx, ['shotgun', 'smg', 'magnum', 'nova', 'orbit']);
    for (const wi of lo.weapons) wi.level = MAX_WEAPON_LEVEL;
    // Six maxed passives, none of which is a recipe requirement for the owned weapons,
    // so nothing can evolve and the real pool is genuinely empty.
    for (const id of ['vest', 'magnet', 'vamp', 'detonate', 'chill', 'desperate']) {
      grant(ctx, id, MAX_PASSIVE_LEVEL);
    }
    const choices = makeChoices(ctx);
    expect(choices).toHaveLength(3);
    expect(choices.every((c) => c.kind === 'bonus')).toBe(true);
  });
});
