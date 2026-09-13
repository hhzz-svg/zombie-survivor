import { describe, it, expect } from 'vitest';
import {
  TALENTS, talentById, talentEffects, applyTalents, buyState, nextCost, totalSpent,
  salvageGain, NO_TALENTS,
} from '../src/data/talents';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { makeCtx, freshStats } from './helpers';
import { damagePlayer } from '../src/systems/combat';
import { evolutionReady, evolutionHint, EVOLUTIONS, MAX_WEAPON_LEVEL } from '../src/data/weapons';
import { Health } from '../src/components';

const NONE = new Set<string>();
const ALL = new Set(ACHIEVEMENTS.map((a) => a.id));

describe('talent tree shape', () => {
  it('gives every level a price and every prerequisite a real node', () => {
    for (const t of TALENTS) {
      expect(t.costs.length).toBe(t.maxLevel);
      expect(t.costs.every((c) => c > 0)).toBe(true);
      // Prices climb, so late levels are a real commitment.
      for (let i = 1; i < t.costs.length; i++) expect(t.costs[i]!).toBeGreaterThan(t.costs[i - 1]!);
      if (t.requires) expect(talentById(t.requires.id)).toBeDefined();
    }
  });

  it('gates its achievement-locked nodes on achievements that exist', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const t of TALENTS) {
      if (t.requiresAchievement) expect(ids.has(t.requiresAchievement.id)).toBe(true);
    }
  });

  it('has no prerequisite cycles and each branch opens with a free-standing node', () => {
    for (const branch of ['kit', 'arms', 'survival'] as const) {
      const nodes = TALENTS.filter((t) => t.branch === branch);
      expect(nodes.filter((t) => !t.requires).length).toBe(1);
      for (const t of nodes) {
        const seen = new Set<string>([t.id]);
        let cur = t.requires?.id;
        while (cur) {
          expect(seen.has(cur)).toBe(false);
          seen.add(cur);
          cur = talentById(cur)?.requires?.id;
        }
      }
    }
  });
});

describe('buying', () => {
  it('refuses a node whose prerequisite is not owned', () => {
    const state = buyState(talentById('plating')!, {}, 99999, ALL);
    expect(state.kind).toBe('requires');
  });

  it('refuses a node whose achievement is missing, and allows it once earned', () => {
    const levels = { caliber: 1, marksman: 2 };
    expect(buyState(talentById('refit')!, levels, 99999, NONE).kind).toBe('achievement');
    expect(buyState(talentById('refit')!, levels, 99999, ALL).kind).toBe('ok');
  });

  it('refuses a node the player cannot afford, and says by how much', () => {
    const def = talentById('vanguard')!;
    const state = buyState(def, {}, 10, ALL);
    expect(state).toEqual({ kind: 'salvage', short: def.costs[0]! - 10 });
  });

  it('reports maxed nodes instead of charging for a level that does not exist', () => {
    const def = talentById('vanguard')!;
    const levels = { vanguard: def.maxLevel };
    expect(nextCost(def, levels)).toBeNull();
    expect(buyState(def, levels, 99999, ALL).kind).toBe('maxed');
  });

  it('refunds exactly what was spent', () => {
    const def = talentById('caliber')!;
    const levels = { caliber: 3, scavenger: 2 };
    const expected = def.costs[0]! + def.costs[1]! + def.costs[2]!
      + talentById('scavenger')!.costs[0]! + talentById('scavenger')!.costs[1]!;
    expect(totalSpent(levels)).toBe(expected);
  });
});

describe('effects', () => {
  it('an empty tree changes nothing', () => {
    expect(talentEffects({})).toEqual(NO_TALENTS);
    const before = freshStats();
    const after = applyTalents(freshStats(), NO_TALENTS);
    expect(after).toEqual(before);
  });

  it('folds levels into the run\'s opening stats', () => {
    const fx = talentEffects({ vanguard: 3, caliber: 2, marksman: 1, scavenger: 4 });
    const base = freshStats();
    const stats = applyTalents(freshStats(), fx);
    expect(stats.maxHp).toBe(base.maxHp + 30);
    expect(stats.damageMul).toBeCloseTo(base.damageMul + 0.12);
    expect(stats.crit).toBeCloseTo(base.crit + 0.03);
    expect(stats.magnet).toBeCloseTo(base.magnet + 0.6);
  });

  it('the refit talent shaves a level off every evolution recipe', () => {
    const recipe = EVOLUTIONS['shotgun']!;
    const passives = new Map([[recipe.passive, recipe.passiveLevel - 1]]);
    expect(evolutionReady('shotgun', MAX_WEAPON_LEVEL, passives, 0)).toBe(false);
    expect(evolutionReady('shotgun', MAX_WEAPON_LEVEL, passives, 1)).toBe(true);
    expect(evolutionHint('shotgun', passives, (id) => id, 1)).toContain(`Lv.${recipe.passiveLevel - 1}`);
  });

  it('never discounts a recipe below Lv.1', () => {
    const recipe = EVOLUTIONS['pistol']!;
    const passives = new Map([[recipe.passive, 1]]);
    expect(evolutionReady('pistol', MAX_WEAPON_LEVEL, passives, 99)).toBe(true);
  });
});

describe('revive protocol', () => {
  it('gets the player back up once instead of ending the run', () => {
    const ctx = makeCtx();
    ctx.run.revivesLeft = 1;
    let died = false;
    ctx.events.onDeath = () => { died = true; };
    const h = ctx.world.get(ctx.player, Health)!;

    damagePlayer(ctx, 9999);

    expect(died).toBe(false);
    expect(ctx.run.revivesLeft).toBe(0);
    expect(h.hp).toBe(Math.round(h.max * 0.5));
    expect(h.invuln).toBeGreaterThanOrEqual(2);
  });

  it('the second lethal hit is final', () => {
    const ctx = makeCtx();
    ctx.run.revivesLeft = 1;
    let died = false;
    ctx.events.onDeath = () => { died = true; };
    const h = ctx.world.get(ctx.player, Health)!;

    damagePlayer(ctx, 9999);
    h.invuln = 0; // i-frames from the revive would otherwise swallow the next hit
    damagePlayer(ctx, 9999);

    expect(died).toBe(true);
    expect(h.hp).toBe(0);
  });

  it('without the talent a lethal hit still kills', () => {
    const ctx = makeCtx();
    let died = false;
    ctx.events.onDeath = () => { died = true; };
    damagePlayer(ctx, 9999);
    expect(died).toBe(true);
  });
});

describe('salvage', () => {
  it('pays out for a loss, and more for a win', () => {
    const run = { time: 90, goldLeft: 120, elites: 4, tyrants: 0 };
    const lost = salvageGain({ ...run, victory: false });
    const won = salvageGain({ ...run, victory: true });
    expect(lost).toBeGreaterThan(0);
    expect(won).toBe(lost + 100);
  });

  it('pays nothing for a run that did nothing', () => {
    expect(salvageGain({ time: 0, goldLeft: 0, elites: 0, tyrants: 0, victory: false })).toBe(0);
  });
});
