import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { ENDLESS_BOSS_INTERVAL, ENDLESS_BOSS_HP_MUL } from '../src/data/balance';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemyAt } from '../src/factory';
import { killEnemy } from '../src/systems/combat';
import { directorSystem } from '../src/systems/spawn';
import { Enemy, Health } from '../src/components';

describe('endless mode', () => {
  it('boss kill in endless keeps the run alive and schedules the next tyrant', () => {
    const ctx = makeCtx();
    let victories = 0;
    ctx.events.onVictory = () => victories++;
    ctx.director.endless = true;
    ctx.time.elapsed = 300;

    const boss = spawnEnemyAt(ctx, ENEMIES['boss']!, 100, 0);
    killEnemy(ctx, boss);

    expect(victories).toBe(0);
    expect(ctx.director.bossDead).toBe(false);
    expect(ctx.run.tyrantsSlain).toBe(1);
    expect(ctx.equip.gold).toBeGreaterThanOrEqual(150);
    expect(ctx.director.nextBossAt).toBeCloseTo(300 + ENDLESS_BOSS_INTERVAL);
  });

  it('boss kill outside endless still ends the run in victory', () => {
    const ctx = makeCtx();
    let victories = 0;
    ctx.events.onVictory = () => victories++;

    const boss = spawnEnemyAt(ctx, ENEMIES['boss']!, 100, 0);
    killEnemy(ctx, boss);

    expect(victories).toBe(1);
    expect(ctx.director.bossDead).toBe(true);
  });

  it('director respawns a scaled tyrant when the timer expires', () => {
    const ctx = makeCtx();
    const d = ctx.director;
    d.endless = true;
    d.bossSpawned = true; // the original story boss already came and went
    d.bossCycle = 0;
    d.nextBossAt = 400;
    ctx.time.elapsed = 400.5;

    directorSystem(ctx, 1 / 60);

    const bosses = ctx.world.query(Enemy).filter((e) => ctx.world.get(e, Enemy)!.def.isBoss);
    expect(bosses).toHaveLength(1);
    expect(d.bossCycle).toBe(1);
    expect(d.nextBossAt).toBeUndefined(); // re-armed only when this tyrant dies
    const h = ctx.world.get(bosses[0]!, Health)!;
    expect(h.max).toBeCloseTo(ENEMIES['boss']!.hp * ENDLESS_BOSS_HP_MUL);
  });
});
