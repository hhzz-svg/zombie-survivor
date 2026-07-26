import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import {
  WINGMEN, MAX_SQUAD, SURVIVOR_FIRST_AT, SURVIVOR_INTERVAL, SURVIVOR_WAIT, wingmanDamage,
} from '../src/data/wingmen';
import { wingmanSystem, squadSize } from '../src/systems/wingman';
import { spawnSurvivor, spawnWingman, spawnEnemyAt } from '../src/factory';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { ENEMIES } from '../src/data/enemies';
import { Bullet, Health, Survivor, Transform, Wingman } from '../src/components';

const gunner = WINGMEN.find((w) => w.id === 'gunner')!;
const medic = WINGMEN.find((w) => w.id === 'medic')!;

describe('rescue wingmen', () => {
  it('a stranded survivor appears on the cadence while there is room', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = SURVIVOR_FIRST_AT;
    wingmanSystem(ctx, 1 / 60);
    expect(ctx.world.query(Survivor)).toHaveLength(1);
    expect(ctx.director.nextSurvivorAt).toBeCloseTo(SURVIVOR_FIRST_AT + SURVIVOR_INTERVAL);
  });

  it('no new survivor spawns once the squad is full', () => {
    const ctx = makeCtx();
    spawnWingman(ctx, gunner, 10, 0, 0);
    spawnWingman(ctx, medic, -10, 0, 1);
    ctx.time.elapsed = SURVIVOR_FIRST_AT;
    wingmanSystem(ctx, 1 / 60);
    expect(ctx.world.query(Survivor)).toHaveLength(0);
    expect(squadSize(ctx)).toBe(MAX_SQUAD);
  });

  it('waiting survivors give up when the timer expires', () => {
    const ctx = makeCtx();
    const s = spawnSurvivor(ctx, gunner);
    const st = ctx.world.get(s, Transform)!;
    st.x = 500; // out of rescue range
    st.y = 0;
    ctx.time.elapsed = SURVIVOR_WAIT + 0.1;
    wingmanSystem(ctx, 1 / 60);
    expect(ctx.world.query(Survivor)).toHaveLength(0);
    expect(squadSize(ctx)).toBe(0);
  });

  it('proximity rescues convert into a wingman and count the tally', () => {
    const ctx = makeCtx();
    const s = spawnSurvivor(ctx, gunner);
    const st = ctx.world.get(s, Transform)!;
    st.x = 0;
    st.y = 0; // on the player
    wingmanSystem(ctx, 1 / 60);
    expect(ctx.world.query(Survivor)).toHaveLength(0);
    expect(squadSize(ctx)).toBe(1);
    expect(ctx.run.rescued).toBe(1);
  });

  it('a gunner fires player-team bullets at an enemy in range', () => {
    const ctx = makeCtx();
    spawnWingman(ctx, gunner, 0, 0, 0);
    spawnEnemyAt(ctx, ENEMIES['walker']!, 120, 0);
    rebuildEnemyHash(ctx);
    wingmanSystem(ctx, gunner.cooldown + 0.01);
    const shots = ctx.world.query(Bullet).map((b) => ctx.world.get(b, Bullet)!);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(shots.every((b) => b.team === 'player')).toBe(true);
  });

  it('a medic heals the player on its cooldown', () => {
    const ctx = makeCtx();
    spawnWingman(ctx, medic, 0, 0, 0);
    const ph = ctx.world.get(ctx.player, Health)!;
    ph.hp = 50;
    wingmanSystem(ctx, medic.cooldown + 0.01);
    expect(ph.hp).toBe(50 + (medic.heal ?? 0));
  });

  it('horde contact wears a wingman down and kills it', () => {
    const ctx = makeCtx();
    const e = spawnWingman(ctx, gunner, 200, 0, 0);
    ctx.world.get(e, Health)!.hp = 3; // one brush from death
    spawnEnemyAt(ctx, ENEMIES['brute']!, 205, 0);
    rebuildEnemyHash(ctx);
    wingmanSystem(ctx, 1 / 60);
    expect(ctx.world.query(Wingman)).toHaveLength(0);
  });

  it('wingman damage scales gently over the run', () => {
    expect(wingmanDamage(gunner, 0)).toBeCloseTo(gunner.damage);
    expect(wingmanDamage(gunner, 240)).toBeCloseTo(gunner.damage * 2);
  });
});
