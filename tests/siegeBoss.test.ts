import { describe, it, expect } from 'vitest';
import { makeCtx } from './helpers';
import { spawnBoss, spawnHazard, BOSS_IDS } from '../src/factory';
import { enemyAISystem } from '../src/systems/enemyAI';
import { telegraphSystem } from '../src/systems/telegraph';
import { hazardSystem } from '../src/systems/hazard';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { SIEGE_SHELLS, SIEGE_BARRAGE_WINDUP, ACID_POOL_DPS, ACID_POOL_SECONDS } from '../src/data/enemies';
import { Enemy, Health, Telegraph, Hazard, Velocity } from '../src/components';
import type { GameContext } from '../src/ctx';

/** Put the siege boss on the field with its barrage ready to fire. */
function armedSiege(ctx: GameContext) {
  const e = spawnBoss(ctx, 1, BOSS_IDS.indexOf('siege'));
  const en = ctx.world.get(e, Enemy)!;
  expect(en.def.id).toBe('siege');
  en.volleyCd = 0;
  en.summonCd = 999;
  rebuildEnemyHash(ctx);
  return { e, en };
}

describe('boss variety', () => {
  it('a run draws one of the bosses rather than always the same fight', () => {
    const drawn = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const ctx = makeCtx(seed);
      const e = spawnBoss(ctx);
      drawn.add(ctx.world.get(e, Enemy)!.def.id);
    }
    expect(drawn).toEqual(new Set(BOSS_IDS));
  });

  it('an explicit cycle picks deterministically, so tests and endless can pin the draw', () => {
    for (let i = 0; i < BOSS_IDS.length; i++) {
      const ctx = makeCtx();
      expect(ctx.world.get(spawnBoss(ctx, 1, i), Enemy)!.def.id).toBe(BOSS_IDS[i]);
    }
  });
});

describe('corrosion matriarch', () => {
  it('opens a barrage of telegraphed shells rather than hitting instantly', () => {
    const ctx = makeCtx();
    const ph = ctx.world.get(ctx.player, Health)!;
    armedSiege(ctx);

    enemyAISystem(ctx, 1 / 60);

    expect(ctx.world.query(Telegraph)).toHaveLength(SIEGE_SHELLS);
    telegraphSystem(ctx, 1 / 60);
    expect(ph.hp).toBe(ph.max); // nothing lands during the wind-up
  });

  it('leads the player, so standing still eats the whole barrage', () => {
    const moving = makeCtx();
    const pv = moving.world.get(moving.player, Velocity)!;
    pv.x = 200;
    pv.y = 0;
    armedSiege(moving);
    enemyAISystem(moving, 1 / 60);
    const xs = moving.world.query(Telegraph).map((e) => moving.world.get(e, Telegraph)!.x);

    // Shells are spread along the heading, not stacked on the player's current spot.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
  });

  it('leaves acid where the shells land, and the acid expires', () => {
    const ctx = makeCtx();
    armedSiege(ctx);
    enemyAISystem(ctx, 1 / 60);

    ctx.time.elapsed += SIEGE_BARRAGE_WINDUP + 1;
    telegraphSystem(ctx, 1 / 60);
    expect(ctx.world.query(Hazard).length).toBe(SIEGE_SHELLS);
    expect(ctx.world.query(Telegraph)).toHaveLength(0); // markers clean themselves up

    ctx.time.elapsed += ACID_POOL_SECONDS + 0.1;
    hazardSystem(ctx, 1 / 60);
    expect(ctx.world.query(Hazard)).toHaveLength(0);
  });

  it('summons wardens, which is what stops you simply walking out of the acid', () => {
    const ctx = makeCtx();
    const { en } = armedSiege(ctx);
    en.volleyCd = 999;
    en.summonCd = 0;

    enemyAISystem(ctx, 1 / 60);

    const wardens = ctx.world.query(Enemy).filter((e) => ctx.world.get(e, Enemy)!.def.id === 'warden');
    expect(wardens.length).toBeGreaterThan(0);
  });
});

describe('acid pools', () => {
  it('tick the player rather than draining per frame', () => {
    const ctx = makeCtx();
    const ph = ctx.world.get(ctx.player, Health)!;
    spawnHazard(ctx, 0, 0, 80, ACID_POOL_SECONDS, ACID_POOL_DPS);

    hazardSystem(ctx, 1 / 60);
    const afterFirst = ph.hp;
    expect(afterFirst).toBeLessThan(ph.max);

    // Same instant, many frames: a tick interval means no extra damage yet.
    for (let i = 0; i < 20; i++) hazardSystem(ctx, 1 / 60);
    expect(ph.hp).toBe(afterFirst);

    ctx.time.elapsed += 0.6;
    hazardSystem(ctx, 1 / 60);
    expect(ph.hp).toBeLessThan(afterFirst);
  });

  it('does not hand out invulnerability, which would make standing in acid a defence', () => {
    const ctx = makeCtx();
    const ph = ctx.world.get(ctx.player, Health)!;
    spawnHazard(ctx, 0, 0, 80, ACID_POOL_SECONDS, ACID_POOL_DPS);

    hazardSystem(ctx, 1 / 60);

    expect(ph.hp).toBeLessThan(ph.max);
    expect(ph.invuln).toBe(0); // a contact hit would have set 0.6s here
  });

  it('leaves the player alone outside the pool', () => {
    const ctx = makeCtx();
    const ph = ctx.world.get(ctx.player, Health)!;
    spawnHazard(ctx, 500, 500, 80, ACID_POOL_SECONDS, ACID_POOL_DPS);
    for (let i = 0; i < 60; i++) hazardSystem(ctx, 1 / 60);
    expect(ph.hp).toBe(ph.max);
  });

  it('does not hurt the horde — a boss killing its own adds would read as a bug', () => {
    const ctx = makeCtx();
    const e = ctx.world.query(Enemy)[0];
    spawnHazard(ctx, 0, 0, 400, ACID_POOL_SECONDS, ACID_POOL_DPS);
    const before = ctx.world.query(Enemy).length;
    for (let i = 0; i < 60; i++) {
      ctx.time.elapsed += 0.6;
      hazardSystem(ctx, 1 / 60);
    }
    expect(ctx.world.query(Enemy).length).toBe(before);
    expect(e).toBe(ctx.world.query(Enemy)[0]);
  });
});
