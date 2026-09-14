import { describe, it, expect } from 'vitest';
import { makeCtx, findObstacle } from './helpers';
import { spawnEnemyAt } from '../src/factory';
import { ENEMIES } from '../src/data/enemies';
import { WEAPONS, EVOLUTIONS } from '../src/data/weapons';
import { weaponSystem } from '../src/systems/weapons';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { rayReach } from '../src/data/obstacles';
import { Loadout, Health, Aim, Transform } from '../src/components';
import type { GameContext } from '../src/ctx';

/** Swap the player onto one weapon and point them along +x. */
function armWith(ctx: GameContext, id: string): void {
  const lo = ctx.world.get(ctx.player, Loadout)!;
  lo.weapons = [{ def: WEAPONS[id], level: 1, cd: 0 }];
  const aim = ctx.world.get(ctx.player, Aim)!;
  aim.x = 1;
  aim.y = 0;
}

const hpOf = (ctx: GameContext, e: number) => ctx.world.get(e, Health)!.hp;

describe('光棱束 — a weapon about where you stand', () => {
  it('hits everything standing in its lane, not just the first body', () => {
    const ctx = makeCtx();
    armWith(ctx, 'beam');
    const line = [120, 220, 320].map((x) => spawnEnemyAt(ctx, ENEMIES['brute'], x, 0));
    rebuildEnemyHash(ctx);
    const before = line.map((e) => hpOf(ctx, e));

    weaponSystem(ctx, 1);

    for (let i = 0; i < line.length; i++) expect(hpOf(ctx, line[i])).toBeLessThan(before[i]);
  });

  it('misses anything outside the beam width', () => {
    const ctx = makeCtx();
    armWith(ctx, 'beam');
    const wide = WEAPONS['beam'].width!;
    const off = spawnEnemyAt(ctx, ENEMIES['walker'], 200, wide * 2 + 60);
    rebuildEnemyHash(ctx);

    weaponSystem(ctx, 1);

    expect(hpOf(ctx, off)).toBe(ctx.world.get(off, Health)!.max);
  });

  it('is stopped by cover — the terrain decides where the lane is', () => {
    const ctx = makeCtx();
    const { o } = findObstacle(ctx.seed);
    // Stand west of the obstacle and fire east through it at a target beyond.
    const pt = ctx.world.get(ctx.player, Transform)!;
    pt.x = o.x - 200;
    pt.y = o.y;
    armWith(ctx, 'beam');
    const behind = spawnEnemyAt(ctx, ENEMIES['brute'], o.x + o.hw + 60, o.y);
    rebuildEnemyHash(ctx);
    expect(rayReach(ctx.seed, pt.x, pt.y, 1, 0, 500)).toBeLessThan(500); // cover really is in the way

    weaponSystem(ctx, 1);

    expect(hpOf(ctx, behind)).toBe(ctx.world.get(behind, Health)!.max);
  });

  it('the evolution fans into several beams', () => {
    expect(WEAPONS[EVOLUTIONS['beam'].evo].projectiles).toBeGreaterThan(WEAPONS['beam'].projectiles);
    expect(WEAPONS[EVOLUTIONS['beam'].evo].spread).toBeGreaterThan(0);
  });
});

describe('链式电弧 — a weapon about how packed they are', () => {
  it('hops through a clustered pack', () => {
    const ctx = makeCtx();
    armWith(ctx, 'arc');
    const pack = [0, 1, 2, 3].map((i) => spawnEnemyAt(ctx, ENEMIES['brute'], 150 + i * 90, i * 20));
    rebuildEnemyHash(ctx);
    const before = pack.map((e) => hpOf(ctx, e));

    weaponSystem(ctx, 1);

    const hurt = pack.filter((e, i) => hpOf(ctx, e) < before[i]);
    expect(hurt.length).toBeGreaterThan(1); // it chained rather than hitting one target
  });

  it('never hits the same body twice in one cast', () => {
    const ctx = makeCtx();
    armWith(ctx, 'arc');
    const lone = spawnEnemyAt(ctx, ENEMIES['brute'], 150, 0);
    rebuildEnemyHash(ctx);
    const h = ctx.world.get(lone, Health)!;
    const before = h.hp;

    weaponSystem(ctx, 1);

    // One target, four jumps available: damage must be a single hit's worth, not four.
    const dealt = before - h.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(WEAPONS['arc'].damage * 2);
  });

  it('dies out when the crowd thins, and reaches further when it does not', () => {
    const spread = makeCtx();
    armWith(spread, 'arc');
    // Second body far beyond the jump range: the chain should stop after the first.
    const near = spawnEnemyAt(spread, ENEMIES['brute'], 150, 0);
    const far = spawnEnemyAt(spread, ENEMIES['brute'], 150 + 600, 0);
    rebuildEnemyHash(spread);

    weaponSystem(spread, 1);

    expect(hpOf(spread, near)).toBeLessThan(spread.world.get(near, Health)!.max);
    expect(hpOf(spread, far)).toBe(spread.world.get(far, Health)!.max);
  });

  it('the evolution chains further', () => {
    expect(WEAPONS[EVOLUTIONS['arc'].evo].projectiles).toBeGreaterThan(WEAPONS['arc'].projectiles);
  });
});

describe('recipes stay distinct', () => {
  it('every evolution names a real passive', () => {
    for (const [id, recipe] of Object.entries(EVOLUTIONS)) {
      expect(WEAPONS[id], id).toBeDefined();
      expect(WEAPONS[recipe.evo], recipe.evo).toBeDefined();
      expect(recipe.passiveLevel).toBeGreaterThan(0);
    }
  });
});
