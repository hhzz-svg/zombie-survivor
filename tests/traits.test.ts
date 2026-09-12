import { describe, it, expect } from 'vitest';
import { makeCtx } from './helpers';
import { spawnEnemyAt } from '../src/factory';
import { ENEMIES } from '../src/data/enemies';
import { damageEnemy } from '../src/systems/combat';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { enemyAISystem } from '../src/systems/enemyAI';
import { weaponSystem } from '../src/systems/weapons';
import { CHILL_SECONDS } from '../src/data/passives';
import { Enemy, Health, Bullet, Transform } from '../src/components';

describe('trait passives', () => {
  it('detonate cooks off the corpse and damages neighbours', () => {
    const ctx = makeCtx();
    ctx.stats.detonate = 1; // always fires, so the assertion is deterministic
    const victim = spawnEnemyAt(ctx, ENEMIES['walker']!, 200, 0);
    const bystander = spawnEnemyAt(ctx, ENEMIES['brute']!, 230, 0);
    rebuildEnemyHash(ctx);
    const before = ctx.world.get(bystander, Health)!.hp;

    damageEnemy(ctx, victim, 9999, 1, 0, 0);

    expect(ctx.world.get(victim, Enemy)).toBeUndefined(); // the kill went through
    expect(ctx.world.get(bystander, Health)!.hp).toBeLessThan(before);
  });

  it('detonate never hurts the player', () => {
    const ctx = makeCtx();
    ctx.stats.detonate = 1;
    const ph = ctx.world.get(ctx.player, Health)!;
    const e = spawnEnemyAt(ctx, ENEMIES['walker']!, 20, 0); // point-blank
    rebuildEnemyHash(ctx);

    damageEnemy(ctx, e, 9999, 1, 0, 0);

    expect(ph.hp).toBe(ph.max);
  });

  it('chill slows an enemy on hit and wears off', () => {
    const ctx = makeCtx();
    ctx.stats.chill = 0.12;
    const e = spawnEnemyAt(ctx, ENEMIES['brute']!, 200, 0);
    rebuildEnemyHash(ctx);

    damageEnemy(ctx, e, 1, 1, 0, 0);
    const en = ctx.world.get(e, Enemy)!;
    expect(en.chillMul).toBeCloseTo(0.88);
    expect(en.chillUntil).toBeCloseTo(ctx.time.elapsed + CHILL_SECONDS);

    ctx.time.elapsed += CHILL_SECONDS + 0.1;
    enemyAISystem(ctx, 1 / 60);
    expect(ctx.world.get(e, Enemy)!.chillMul).toBe(1);
  });

  it('chill is capped no matter how many levels are stacked', () => {
    const ctx = makeCtx();
    ctx.stats.chill = 5;
    const e = spawnEnemyAt(ctx, ENEMIES['brute']!, 200, 0);
    rebuildEnemyHash(ctx);
    damageEnemy(ctx, e, 1, 1, 0, 0);
    expect(ctx.world.get(e, Enemy)!.chillMul).toBeGreaterThan(0.4);
  });

  it('desperate only pays out below the HP threshold', () => {
    const healthy = firedDamage(1.0);
    const cornered = firedDamage(0.2);
    expect(cornered).toBeCloseTo(healthy * 1.15);
  });
});

/** Fire the starter pistol once at `hpFrac` health and read the bullet's rolled damage. */
function firedDamage(hpFrac: number): number {
  const ctx = makeCtx();
  ctx.stats.desperate = 0.15;
  const h = ctx.world.get(ctx.player, Health)!;
  h.hp = h.max * hpFrac;
  weaponSystem(ctx, 1);
  const bullets = ctx.world.query(Bullet, Transform);
  expect(bullets.length).toBeGreaterThan(0);
  return ctx.world.get(bullets[0]!, Bullet)!.dmg;
}
