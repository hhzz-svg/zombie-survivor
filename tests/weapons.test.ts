import { describe, it, expect } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { GameContext, PlayerStats, EquipmentState } from '../src/ctx';
import { PLAYER_BASE, xpToNext } from '../src/data/balance';
import { WEAPONS } from '../src/data/weapons';
import { createPlayer } from '../src/factory';
import { Bullet, Loadout, Transform } from '../src/components';
import { weaponSystem } from '../src/systems/weapons';

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

describe('weapon handling', () => {
  it('non-aim weapons do not replace the held weapon visual', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    lo.weapons = [
      { def: WEAPONS.pistol!, level: 1, cd: 10 },
      { def: WEAPONS.nova!, level: 1, cd: 0 },
    ];
    lo.activeWeapon = 'pistol';

    weaponSystem(ctx, 0);

    expect(lo.activeWeapon).toBe('pistol');
  });

  it('aimed bullets start at the weapon muzzle instead of the player center', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    lo.weapons = [{ def: WEAPONS.pistol!, level: 1, cd: 0 }];

    weaponSystem(ctx, 0);

    const bullets = ctx.world.query(Bullet, Transform);
    expect(bullets).toHaveLength(1);
    const bt = ctx.world.get(bullets[0]!, Transform)!;
    expect(bt.x).toBeGreaterThan(PLAYER_BASE.radius);
    expect(Math.abs(bt.y)).toBeLessThan(0.001);
  });

  it('background fire does not pull the held weapon back to a faster starter gun', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    lo.weapons = [
      { def: WEAPONS.pistol!, level: 1, cd: 0 },
      { def: WEAPONS.shotgun!, level: 1, cd: 10 },
    ];
    lo.activeWeapon = 'shotgun';

    weaponSystem(ctx, 0);

    expect(lo.activeWeapon).toBe('shotgun');
  });
});
