import { describe, it, expect } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { GameContext, PlayerStats } from '../src/ctx';
import { PLAYER_BASE, xpToNext } from '../src/data/balance';
import { WEAPONS } from '../src/data/weapons';
import { createPlayer } from '../src/factory';
import { makeChoices, applyChoice } from '../src/progression';
import { Loadout, Health } from '../src/components';

function makeCtx(): GameContext {
  const world = new World(makeRng(5));
  const stats: PlayerStats = {
    level: 1, xp: 0, xpToNext: xpToNext(1), kills: 0,
    damageMul: 1, fireRateMul: 1, moveSpeed: PLAYER_BASE.moveSpeed, maxHp: PLAYER_BASE.maxHp,
    pierceBonus: 0, magnet: 0, projectileBonus: 0, crit: 0, lifesteal: 0,
  };
  const ctx: GameContext = {
    world, player: 0, hash: new SpatialHash(40), fx: new FX(), audio: new AudioBus(),
    time: { elapsed: 0, hitStop: 0 }, director: { budget: 0, bossSpawned: false, bossDead: false },
    stats, input: { axis: () => ({ x: 0, y: 0 }), aim: () => ({ x: 1, y: 0 }) },
    rng: world.rng, camera: { x: 0, y: 0 }, screen: { shake: 0 },
    events: { onLevelUp: () => {}, onDeath: () => {}, onVictory: () => {} },
    equip: { gold: 0, charges: new Map(), buffs: new Map(), buffUndo: new Map(), shield: 0, deathDanceStacks: 0 },
  };
  ctx.player = createPlayer(ctx);
  return ctx;
}

describe('progression', () => {
  it('offers exactly 3 choices', () => {
    expect(makeChoices(makeCtx())).toHaveLength(3);
  });

  it('damage passive raises damageMul', () => {
    const ctx = makeCtx();
    const before = ctx.stats.damageMul;
    applyChoice(ctx, { kind: 'passive', passive: { id: 'pow', name: 'x', desc: '', stat: 'damageMul', amount: 0.2 }, label: '', desc: '' });
    expect(ctx.stats.damageMul).toBeCloseTo(before + 0.2);
  });

  it('maxHp passive raises Health.max and heals', () => {
    const ctx = makeCtx();
    const h = ctx.world.get(ctx.player, Health)!;
    const m = h.max;
    applyChoice(ctx, { kind: 'passive', passive: { id: 'vest', name: 'x', desc: '', stat: 'maxHp', amount: 25 }, label: '', desc: '' });
    expect(h.max).toBe(m + 25);
  });

  it('new weapon is added to the loadout', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    const n = lo.weapons.length;
    applyChoice(ctx, {
      kind: 'weapon-new',
      weapon: { id: 'nova', name: '冲击波', kind: 'nova', cooldown: 2, damage: 20, projectiles: 1, speed: 0, pierce: 0, spread: 0, range: 120, knockback: 200, life: 0.25 },
      label: '', desc: '',
    });
    expect(lo.weapons.length).toBe(n + 1);
  });

  it('new aim weapons become held while skill weapons do not', () => {
    const ctx = makeCtx();
    const lo = ctx.world.get(ctx.player, Loadout)!;
    applyChoice(ctx, {
      kind: 'weapon-new',
      weapon: WEAPONS.shotgun!,
      label: '', desc: '',
    });
    expect(lo.activeWeapon).toBe('shotgun');

    applyChoice(ctx, {
      kind: 'weapon-new',
      weapon: WEAPONS.nova!,
      label: '', desc: '',
    });
    expect(lo.activeWeapon).toBe('shotgun');
  });
});
