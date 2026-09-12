import { describe, it, expect } from 'vitest';
import { makeCtx } from './helpers';
import { spawnEnemyAt } from '../src/factory';
import { ENEMIES } from '../src/data/enemies';
import { enemyAISystem } from '../src/systems/enemyAI';
import { telegraphSystem } from '../src/systems/telegraph';
import { damageEnemy } from '../src/systems/combat';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import {
  WARDEN_FRONT_MUL, WARDEN_TURN_RATE, BROOD_INTERVAL, BROOD_LITTER,
  LASHER_WINDUP, LASHER_DAMAGE,
} from '../src/data/enemies';
import { Enemy, Health, Transform, Telegraph } from '../src/components';

describe('warden — the shield forces a flank', () => {
  it('mostly blocks fire that lands inside the frontal arc', () => {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['warden']!, 200, 0);
    const en = ctx.world.get(e, Enemy)!;
    en.faceX = -1; // facing the player at the origin
    en.faceY = 0;
    const h = ctx.world.get(e, Health)!;
    const before = h.hp;

    // Bullet travelling +x, straight into the shield.
    damageEnemy(ctx, e, 100, 1, 0, 0);

    expect(before - h.hp).toBeCloseTo(100 * WARDEN_FRONT_MUL);
  });

  it('takes full damage from behind', () => {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['warden']!, 200, 0);
    const en = ctx.world.get(e, Enemy)!;
    en.faceX = -1;
    en.faceY = 0;
    const h = ctx.world.get(e, Health)!;
    const before = h.hp;

    damageEnemy(ctx, e, 100, -1, 0, 0); // shot from its back

    expect(before - h.hp).toBeCloseTo(100);
  });

  it('turns too slowly to simply face whoever is shooting it', () => {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['warden']!, 200, 0);
    const en = ctx.world.get(e, Enemy)!;
    en.faceX = 1; // pointing away from the player
    en.faceY = 0;
    rebuildEnemyHash(ctx);

    const dt = 1 / 60;
    enemyAISystem(ctx, dt);

    // One frame can only swing the shield by the turn rate — no snapping around.
    const swung = Math.acos(Math.max(-1, Math.min(1, en.faceX)));
    expect(swung).toBeLessThanOrEqual(WARDEN_TURN_RATE * dt + 1e-6);
    expect(swung).toBeGreaterThan(0);
  });

  it('other enemies are unaffected by the arc check', () => {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['brute']!, 200, 0);
    const h = ctx.world.get(e, Health)!;
    const before = h.hp;
    damageEnemy(ctx, e, 50, 1, 0, 0);
    expect(before - h.hp).toBeCloseTo(50);
  });
});

describe('brood — ignore it and the field floods', () => {
  it('hatches a litter on its own timer', () => {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['brood']!, 400, 0);
    ctx.world.get(e, Enemy)!.abilityCd = 0;
    rebuildEnemyHash(ctx);
    const before = ctx.world.query(Enemy).length;

    enemyAISystem(ctx, 1 / 60);

    expect(ctx.world.query(Enemy).length).toBe(before + BROOD_LITTER);
    expect(ctx.world.get(e, Enemy)!.abilityCd).toBeCloseTo(BROOD_INTERVAL);
  });

  it('does not hatch again until the timer comes round', () => {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['brood']!, 400, 0);
    ctx.world.get(e, Enemy)!.abilityCd = 0;
    rebuildEnemyHash(ctx);
    enemyAISystem(ctx, 1 / 60);
    const after = ctx.world.query(Enemy).length;

    for (let i = 0; i < 30; i++) enemyAISystem(ctx, 1 / 60);

    expect(ctx.world.query(Enemy).length).toBe(after);
  });
});

describe('lasher — standing still at range is no longer safe', () => {
  function armedLasher(dist: number) {
    const ctx = makeCtx();
    const e = spawnEnemyAt(ctx, ENEMIES['lasher']!, dist, 0);
    ctx.world.get(e, Enemy)!.abilityCd = 0;
    rebuildEnemyHash(ctx);
    return { ctx, e };
  }

  it('winds up a hook inside its range band', () => {
    const { ctx, e } = armedLasher(300);
    enemyAISystem(ctx, 1 / 60);
    expect(ctx.world.has(e, Telegraph)).toBe(true);
  });

  it('does nothing while the player is too close or too far', () => {
    for (const d of [120, 700]) {
      const { ctx, e } = armedLasher(d);
      enemyAISystem(ctx, 1 / 60);
      expect(ctx.world.has(e, Telegraph)).toBe(false);
    }
  });

  it('drags the player in and hurts them only when the hook lands', () => {
    const { ctx } = armedLasher(300);
    enemyAISystem(ctx, 1 / 60);
    const pt = ctx.world.get(ctx.player, Transform)!;
    const ph = ctx.world.get(ctx.player, Health)!;
    const startX = pt.x;

    telegraphSystem(ctx, 1 / 60); // still winding up
    expect(pt.x).toBe(startX);
    expect(ph.hp).toBe(ph.max);

    ctx.time.elapsed += LASHER_WINDUP;
    telegraphSystem(ctx, 1 / 60);

    expect(pt.x).toBeGreaterThan(startX); // yanked toward the lasher
    expect(ph.max - ph.hp).toBeCloseTo(LASHER_DAMAGE);
  });
});
