import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { WEAPONS, EVOLUTIONS } from '../src/data/weapons';
import { ENEMIES } from '../src/data/enemies';
import { spawnBullet, spawnEnemyAt } from '../src/factory';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { bulletSystem } from '../src/systems/bullets';
import { Bullet, Health } from '../src/components';

describe('flamer and rocket launcher', () => {
  it('both weapons and their evolutions parse and are linked', () => {
    expect(WEAPONS['flamer']).toBeDefined();
    expect(WEAPONS['rocket']).toBeDefined();
    expect(EVOLUTIONS['flamer']).toBe('flamer-evo');
    expect(EVOLUTIONS['rocket']).toBe('rocket-evo');
    expect(WEAPONS['flamer']!.bulletStyle).toBe('flame');
    expect(WEAPONS['rocket-evo']!.explodeRadius).toBeGreaterThan(WEAPONS['rocket']!.explodeRadius!);
  });

  it('spawned bullets carry the style and splash radius', () => {
    const ctx = makeCtx();
    const b = spawnBullet(ctx, 0, 0, 1, 0, WEAPONS['rocket']!, 34, 0);
    const data = ctx.world.get(b, Bullet)!;
    expect(data.style).toBe('rocket');
    expect(data.explodeRadius).toBe(95);
  });

  it('a rocket hit splashes damage onto clustered enemies', () => {
    const ctx = makeCtx();
    const hit = spawnEnemyAt(ctx, ENEMIES['brute']!, 40, 0);
    const near = spawnEnemyAt(ctx, ENEMIES['brute']!, 90, 0); // inside 95px splash
    const far = spawnEnemyAt(ctx, ENEMIES['brute']!, 400, 0); // outside
    rebuildEnemyHash(ctx);

    spawnBullet(ctx, 30, 0, 1, 0, WEAPONS['rocket']!, 34, 0);
    bulletSystem(ctx, 1 / 60);

    const hpOf = (e: number) => ctx.world.get(e, Health)!;
    expect(hpOf(hit).hp).toBeLessThan(hpOf(hit).max);
    expect(hpOf(near).hp).toBeLessThan(hpOf(near).max);
    expect(hpOf(far).hp).toBe(hpOf(far).max);
    expect(ctx.world.query(Bullet)).toHaveLength(0); // rocket is spent on impact
  });

  it('rocket splash never hurts the player standing next to the blast', () => {
    const ctx = makeCtx();
    spawnEnemyAt(ctx, ENEMIES['walker']!, 30, 0);
    rebuildEnemyHash(ctx);
    const before = ctx.world.get(ctx.player, Health)!.hp;

    spawnBullet(ctx, 20, 0, 1, 0, WEAPONS['rocket']!, 34, 0);
    bulletSystem(ctx, 1 / 60);

    expect(ctx.world.get(ctx.player, Health)!.hp).toBe(before);
  });
});
