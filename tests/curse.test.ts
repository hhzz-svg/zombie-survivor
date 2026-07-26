import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { runFlowSystem } from '../src/runFlow';
import {
  curseAltarSystem, curseSpawnMul, curseEliteBonus, curseXpMul, curseGoldMul, spawnCurseAltar,
} from '../src/systems/curse';
import { collectXp } from '../src/systems/player';
import { CurseAltar, Transform } from '../src/components';

describe('blood-curse altars', () => {
  it('stage advances from stage 2 raise one altar each', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = 60; // stage 2
    runFlowSystem(ctx);
    expect(ctx.world.query(CurseAltar)).toHaveLength(1);

    runFlowSystem(ctx); // same stage → no second altar
    expect(ctx.world.query(CurseAltar)).toHaveLength(1);

    ctx.time.elapsed = 120; // stage 3
    runFlowSystem(ctx);
    expect(ctx.world.query(CurseAltar)).toHaveLength(2);
  });

  it('touching an altar consumes it and stacks the curse', () => {
    const ctx = makeCtx();
    const altar = spawnCurseAltar(ctx);
    const at = ctx.world.get(altar, Transform)!;
    at.x = 0;
    at.y = 0; // onto the player

    curseAltarSystem(ctx, 1 / 60);

    expect(ctx.world.query(CurseAltar)).toHaveLength(0);
    expect(ctx.run.curse).toBe(1);
  });

  it('stacks scale spawns, elites, xp, and gold', () => {
    const ctx = makeCtx();
    expect(curseSpawnMul(ctx)).toBe(1);
    ctx.run.curse = 2;
    expect(curseSpawnMul(ctx)).toBeCloseTo(1.3);
    expect(curseEliteBonus(ctx)).toBeCloseTo(0.06);
    expect(curseXpMul(ctx)).toBeCloseTo(1.4);
    expect(curseGoldMul(ctx)).toBeCloseTo(1.2);
  });

  it('cursed xp actually lands multiplied', () => {
    const ctx = makeCtx();
    ctx.run.curse = 2; // ×1.4
    collectXp(ctx, 5);
    expect(ctx.stats.xp).toBe(7);
  });
});
