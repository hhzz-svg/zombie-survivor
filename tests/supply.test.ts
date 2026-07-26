import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { SUPPLY_FIRST_AT, SUPPLY_INTERVAL, SUPPLY_FALL_SECONDS } from '../src/data/balance';
import { supplyDropSystem, applyCrateReward, rollCrateReward, CRATE_REWARDS } from '../src/systems/supply';
import { spawnGem, spawnCoin } from '../src/factory';
import { Health, Loadout, SupplyCrate, Transform, XPGem, GoldCoin } from '../src/components';

describe('supply drops', () => {
  it('spawns a crate on the cadence and schedules the next one', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = SUPPLY_FIRST_AT;
    supplyDropSystem(ctx, 1 / 60);
    expect(ctx.world.query(SupplyCrate)).toHaveLength(1);
    expect(ctx.director.nextDropAt).toBeCloseTo(SUPPLY_FIRST_AT + SUPPLY_INTERVAL);
  });

  it('cannot be collected while still falling, then opens by proximity', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = SUPPLY_FIRST_AT;
    supplyDropSystem(ctx, 1 / 60);
    const crate = ctx.world.query(SupplyCrate)[0]!;
    // teleport the crate onto the player so only the fall timer gates pickup
    const ct = ctx.world.get(crate, Transform)!;
    ct.x = 0;
    ct.y = 0;

    supplyDropSystem(ctx, 1 / 60);
    expect(ctx.world.query(SupplyCrate)).toHaveLength(1); // still airborne

    ctx.time.elapsed += SUPPLY_FALL_SECONDS + 0.01;
    supplyDropSystem(ctx, 1 / 60);
    expect(ctx.world.query(SupplyCrate)).toHaveLength(0);
    expect(ctx.run.cratesOpened).toBe(1);
  });

  it('weighted roll always lands on a defined reward', () => {
    for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
      const reward = rollCrateReward(() => roll);
      expect(CRATE_REWARDS.some((r) => r.id === reward.id)).toBe(true);
    }
  });

  it('gold reward adds gold', () => {
    const ctx = makeCtx();
    applyCrateReward(ctx, 'gold');
    expect(ctx.equip.gold).toBeGreaterThanOrEqual(30);
  });

  it('vacuum reward sweeps every gem and coin on the field', () => {
    const ctx = makeCtx();
    spawnGem(ctx, 500, 500, 4); // 4 + 3 = 7 xp, below the 9-xp first level-up
    spawnGem(ctx, -900, 200, 3);
    spawnCoin(ctx, 800, -800, 12);
    const desc = applyCrateReward(ctx, 'vacuum');
    expect(ctx.world.query(XPGem)).toHaveLength(0);
    expect(ctx.world.query(GoldCoin)).toHaveLength(0);
    expect(ctx.stats.xp).toBe(7);
    expect(ctx.equip.gold).toBe(12);
    expect(desc).toContain('7');
  });

  it('heal reward restores up to 50 hp', () => {
    const ctx = makeCtx();
    const h = ctx.world.get(ctx.player, Health)!;
    h.hp = 10;
    applyCrateReward(ctx, 'heal');
    expect(h.hp).toBe(60);
  });

  it('ammo reward applies a timed damage buff', () => {
    const ctx = makeCtx();
    const base = ctx.stats.damageMul;
    applyCrateReward(ctx, 'ammo');
    expect(ctx.stats.damageMul).toBeCloseTo(base + 0.18);
    expect(ctx.equip.buffs.has('supplyAmmo')).toBe(true);
  });

  it('weaponUp reward levels an owned weapon, or refunds gold at cap', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    applyCrateReward(ctx, 'weaponUp');
    expect(lo.weapons[0]!.level).toBe(2);

    lo.weapons.forEach((w) => {
      w.level = 6;
    });
    const goldBefore = ctx.equip.gold;
    applyCrateReward(ctx, 'weaponUp');
    expect(ctx.equip.gold).toBe(goldBefore + 25);
  });

  it('shieldCell reward stacks a shield layer', () => {
    const ctx = makeCtx();
    applyCrateReward(ctx, 'shieldCell');
    expect(ctx.equip.shield).toBe(1);
  });
});
