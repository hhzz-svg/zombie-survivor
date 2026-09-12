import { describe, it, expect } from 'vitest';
import { makeCtx, findObstacle } from './helpers';
import { blockerSystem, barrelSystem } from '../src/systems/collision';
import { movementSystem } from '../src/systems/movement';
import { bulletSystem } from '../src/systems/bullets';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { damageEnemy } from '../src/systems/combat';
import { spawnBullet, spawnEnemyBullet, spawnBarrel, spawnEnemyAt } from '../src/factory';
import { WEAPONS } from '../src/data/weapons';
import { ENEMIES } from '../src/data/enemies';
import { blockedAt, cellBarrel, BARREL_FUSE, OBSTACLE_CELL } from '../src/data/obstacles';
import { Transform, Velocity, Bullet, Barrel, Health } from '../src/components';

const SEED = 5; // the seed tests/helpers.ts builds its context with

describe('terrain collision', () => {
  it('pushes the player out of cover and keeps them out', () => {
    const ctx = makeCtx();
    const { o } = findObstacle(SEED);
    const pt = ctx.world.get(ctx.player, Transform)!;
    pt.x = o.x;
    pt.y = o.y;

    blockerSystem(ctx);

    expect(blockedAt(ctx.seed, pt.x, pt.y, 11.9)).toBe(false);
  });

  it('slides along a wall instead of sticking to it', () => {
    const ctx = makeCtx();
    const { o } = findObstacle(SEED);
    const pt = ctx.world.get(ctx.player, Transform)!;
    const pv = ctx.world.get(ctx.player, Velocity)!;
    // Stand just above the box and walk diagonally into it.
    pt.x = o.x - o.hw * 0.5;
    pt.y = o.y - o.hh - 12;
    const startX = pt.x;

    for (let i = 0; i < 60; i++) {
      pv.x = 150;
      pv.y = 150; // straight into the top face
      movementSystem(ctx.world, 1 / 60);
      blockerSystem(ctx);
    }

    expect(blockedAt(ctx.seed, pt.x, pt.y, 11.9)).toBe(false);
    expect(pt.x - startX).toBeGreaterThan(40); // the sideways component survived
  });

  it('stops player bullets at cover', () => {
    const ctx = makeCtx();
    const { o } = findObstacle(SEED);
    const b = spawnBullet(ctx, o.x, o.y, 1, 0, WEAPONS['pistol']!, 9, 0);
    rebuildEnemyHash(ctx);

    bulletSystem(ctx, 1 / 60);

    expect(ctx.world.get(b, Bullet)).toBeUndefined();
  });

  it('stops enemy bullets at cover too — breaking line of sight is the counter-play', () => {
    const ctx = makeCtx();
    const { o } = findObstacle(SEED);
    const b = spawnEnemyBullet(ctx, o.x, o.y, 1, 0);
    rebuildEnemyHash(ctx);

    bulletSystem(ctx, 1 / 60);

    expect(ctx.world.get(b, Bullet)).toBeUndefined();
  });

  it('lets bullets through open ground', () => {
    const ctx = makeCtx();
    const b = spawnBullet(ctx, 0, 0, 1, 0, WEAPONS['pistol']!, 9, 0);
    rebuildEnemyHash(ctx);

    bulletSystem(ctx, 1 / 60);

    expect(ctx.world.get(b, Bullet)).toBeDefined();
  });
});

describe('explosive barrels', () => {
  it('materialises a cell once and never respawns a destroyed barrel', () => {
    const ctx = makeCtx();
    // Find a barrel cell and stand next to it.
    let cell: { cx: number; cy: number; x: number; y: number } | null = null;
    for (let cx = -8; cx <= 8 && !cell; cx++) {
      for (let cy = -8; cy <= 8 && !cell; cy++) {
        const b = cellBarrel(ctx.seed, cx, cy);
        if (b) cell = { cx, cy, ...b };
      }
    }
    expect(cell).not.toBeNull();
    const pt = ctx.world.get(ctx.player, Transform)!;
    pt.x = cell!.cx * OBSTACLE_CELL;
    pt.y = cell!.cy * OBSTACLE_CELL;

    barrelSystem(ctx, 1 / 60);
    const first = ctx.world.query(Barrel).length;
    expect(first).toBeGreaterThan(0);

    barrelSystem(ctx, 1 / 60); // same cells again
    expect(ctx.world.query(Barrel).length).toBe(first);

    for (const e of ctx.world.query(Barrel)) ctx.world.destroy(e);
    barrelSystem(ctx, 1 / 60);
    expect(ctx.world.query(Barrel).length).toBe(0);
  });

  it('takes fire, lights a fuse, then blows up the crowd around it', () => {
    const ctx = makeCtx();
    ctx.director.activatedCells = new Set(); // keep procedural barrels out of this test
    const barrel = spawnBarrel(ctx, 300, 0);
    const victim = spawnEnemyAt(ctx, ENEMIES['brute']!, 340, 0);
    rebuildEnemyHash(ctx);
    const before = ctx.world.get(victim, Health)!.hp;

    damageEnemy(ctx, barrel, 999, 1, 0, 200);
    expect(ctx.world.get(barrel, Barrel)!.fuse).toBeCloseTo(BARREL_FUSE);
    expect(ctx.world.get(victim, Health)!.hp).toBe(before); // the fuse buys a moment to step away

    for (let i = 0; i < 40; i++) barrelSystem(ctx, 1 / 60);

    expect(ctx.world.get(barrel, Barrel)).toBeUndefined();
    expect(ctx.world.get(victim, Health)!.hp).toBeLessThan(before);
  });

  it('does not take knockback or pop damage numbers like an enemy', () => {
    const ctx = makeCtx();
    const barrel = spawnBarrel(ctx, 300, 0);
    rebuildEnemyHash(ctx);

    damageEnemy(ctx, barrel, 5, 1, 0, 500);

    const t = ctx.world.get(barrel, Transform)!;
    expect(t.x).toBe(300);
    expect(t.y).toBe(0);
  });
});
