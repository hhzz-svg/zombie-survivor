import { describe, it, expect } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { GameContext, PlayerStats, EquipmentState } from '../src/ctx';
import { PLAYER_BASE, xpToNext } from '../src/data/balance';
import { createPlayer } from '../src/factory';
import { startBuff, buffActive, useItem, equipmentSystem } from '../src/systems/equipment';

function freshStats(): PlayerStats {
  return {
    level: 1, xp: 0, xpToNext: xpToNext(1), kills: 0,
    damageMul: 1, fireRateMul: 1, moveSpeed: PLAYER_BASE.moveSpeed, maxHp: PLAYER_BASE.maxHp,
    pierceBonus: 0, magnet: 0, projectileBonus: 0, crit: 0, lifesteal: 0,
  };
}

function freshEquip(): EquipmentState {
  return {
    gold: 0, charges: new Map(), buffs: new Map(), buffUndo: new Map(),
    shield: 0, deathDanceStacks: 0,
  };
}

function makeCtx(): GameContext {
  const world = new World(makeRng(5));
  const ctx: GameContext = {
    world, player: 0, hash: new SpatialHash(40), fx: new FX(), audio: new AudioBus(),
    time: { elapsed: 0, hitStop: 0 }, director: { budget: 0, bossSpawned: false, bossDead: false },
    stats: freshStats(), input: { axis: () => ({ x: 0, y: 0 }), aim: () => ({ x: 1, y: 0 }) },
    rng: world.rng, camera: { x: 0, y: 0 }, screen: { shake: 0 },
    events: { onLevelUp: () => {}, onDeath: () => {}, onVictory: () => {} },
    equip: freshEquip(),
  };
  ctx.player = createPlayer(ctx);
  return ctx;
}

describe('equipment buffs', () => {
  it('boots buff applies once and reverts exactly on expiry', () => {
    const ctx = makeCtx();
    const baseSpeed = ctx.stats.moveSpeed;
    const baseDmg = ctx.stats.damageMul;
    startBuff(ctx, 'boots', 45);
    expect(ctx.stats.moveSpeed).toBeCloseTo(baseSpeed * 1.18);
    expect(ctx.stats.damageMul).toBeCloseTo(baseDmg + 0.2);

    ctx.time.elapsed = 46;
    equipmentSystem(ctx, 1 / 60);
    expect(ctx.stats.moveSpeed).toBeCloseTo(baseSpeed);
    expect(ctx.stats.damageMul).toBeCloseTo(baseDmg);
  });

  it('re-buying a buff refreshes the timer without stacking the effect', () => {
    const ctx = makeCtx();
    const baseSpeed = ctx.stats.moveSpeed;
    startBuff(ctx, 'boots', 45);
    ctx.time.elapsed = 10;
    startBuff(ctx, 'boots', 45); // refresh
    expect(ctx.stats.moveSpeed).toBeCloseTo(baseSpeed * 1.18); // not 1.18^2
    expect(ctx.equip.buffs.get('boots')).toBeCloseTo(55);
  });

  it('repeated berserk uses never permanently degrade fireRate/damage (regression)', () => {
    const ctx = makeCtx();
    const baseDmg = ctx.stats.damageMul;
    const baseRof = ctx.stats.fireRateMul;
    for (let cycle = 0; cycle < 5; cycle++) {
      ctx.equip.charges.set('berserk', 1);
      useItem(ctx, 'KeyR'); // spends a charge, starts 5s rage
      expect(buffActive(ctx, 'berserk')).toBe(true);
      ctx.time.elapsed += 6; // let it expire
      equipmentSystem(ctx, 1 / 60);
      expect(ctx.stats.damageMul).toBeCloseTo(baseDmg);
      expect(ctx.stats.fireRateMul).toBeCloseTo(baseRof);
    }
  });

  it('charge items only fire when a charge is available', () => {
    const ctx = makeCtx();
    expect(useItem(ctx, 'KeyR')).toBe(false); // none owned
    ctx.equip.charges.set('berserk', 2);
    expect(useItem(ctx, 'KeyR')).toBe(true);
    expect(ctx.equip.charges.get('berserk')).toBe(1);
  });
});
