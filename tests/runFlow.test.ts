import { describe, expect, it } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { EquipmentState, GameContext, PlayerStats, SkillState } from '../src/ctx';
import { PLAYER_BASE, xpToNext } from '../src/data/balance';
import { Health } from '../src/components';
import { createPlayer } from '../src/factory';
import {
  introSpawnMultiplier,
  pickupRangeMultiplier,
  runFlowSystem,
  stageRewardFor,
} from '../src/runFlow';

function makeCtx(): GameContext {
  const world = new World(makeRng(19));
  const stats: PlayerStats = {
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    kills: 0,
    damageMul: 1,
    fireRateMul: 1,
    moveSpeed: PLAYER_BASE.moveSpeed,
    maxHp: PLAYER_BASE.maxHp,
    pierceBonus: 0,
    magnet: 0,
    projectileBonus: 0,
    crit: 0,
    lifesteal: 0,
  };
  const equip: EquipmentState = {
    gold: 0,
    charges: new Map(),
    buffs: new Map(),
    buffUndo: new Map(),
    shield: 0,
    deathDanceStacks: 0,
  };
  const skills: SkillState = {
    owned: new Set(),
    cooldowns: new Map(),
    barrierUntil: 0,
    barrierLayers: 0,
    slowUntil: 0,
    dashUntil: 0,
  };
  const ctx: GameContext = {
    world,
    player: 0,
    hash: new SpatialHash(40),
    fx: new FX(),
    audio: new AudioBus(),
    time: { elapsed: 0, hitStop: 0 },
    director: { budget: 0, bossSpawned: false, bossDead: false },
    stats,
    equip,
    skills,
    input: { axis: () => ({ x: 0, y: 0 }), aim: () => ({ x: 1, y: 0 }) },
    rng: world.rng,
    camera: { x: 0, y: 0 },
    screen: { shake: 0 },
    events: { onLevelUp: () => {}, onDeath: () => {}, onVictory: () => {} },
  };
  ctx.player = createPlayer(ctx);
  return ctx;
}

describe('run flow', () => {
  it('ramps early spawn pressure without changing later stages', () => {
    expect(introSpawnMultiplier(0)).toBeCloseTo(0.5);
    expect(introSpawnMultiplier(10)).toBeCloseTo(0.75);
    expect(introSpawnMultiplier(20)).toBe(1);
    expect(introSpawnMultiplier(120)).toBe(1);
  });

  it('temporarily expands pickup range during onboarding', () => {
    expect(pickupRangeMultiplier(0, 0)).toBeCloseTo(1.75);
    expect(pickupRangeMultiplier(29.9, 0.4)).toBeCloseTo(2.45);
    expect(pickupRangeMultiplier(30, 0.4)).toBeCloseTo(1.4);
  });

  it('defines a readable reward for each later stage', () => {
    expect(stageRewardFor(1)).toEqual({ gold: 0, heal: 0 });
    expect(stageRewardFor(2)).toEqual({ gold: 10, heal: 10 });
    expect(stageRewardFor(5)).toEqual({ gold: 16, heal: 10 });
  });

  it('applies a stage reward once when the stage index advances', () => {
    const ctx = makeCtx();
    ctx.world.get(ctx.player, Health)!.hp = 60;
    ctx.time.elapsed = 60;

    runFlowSystem(ctx);
    runFlowSystem(ctx);

    expect(ctx.equip.gold).toBe(10);
    expect(ctx.world.get(ctx.player, Health)!.hp).toBe(70);
    expect(ctx.director.stageIndex).toBe(2);
    expect(ctx.director.stageBannerUntil).toBeCloseTo(61.5);
  });
});
