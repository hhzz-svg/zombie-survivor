import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { GameContext, PlayerStats, EquipmentState, SkillState } from '../src/ctx';
import { PLAYER_BASE, xpToNext } from '../src/data/balance';
import { createPlayer } from '../src/factory';
import { freshRunState } from '../src/systems/combo';
import { cellObstacle, type Obstacle } from '../src/data/obstacles';

/** Shared deterministic GameContext builder for the newer feature tests. */

export function freshStats(): PlayerStats {
  return {
    level: 1, xp: 0, xpToNext: xpToNext(1), kills: 0,
    damageMul: 1, fireRateMul: 1, moveSpeed: PLAYER_BASE.moveSpeed, maxHp: PLAYER_BASE.maxHp,
    pierceBonus: 0, magnet: 0, projectileBonus: 0, crit: 0, lifesteal: 0,
    detonate: 0, chill: 0, desperate: 0, evoDiscount: 0,
  };
}

export function freshEquip(): EquipmentState {
  return {
    gold: 0, charges: new Map(), buffs: new Map(), buffUndo: new Map(),
    shield: 0, deathDanceStacks: 0,
  };
}

export function freshSkills(): SkillState {
  return {
    owned: new Set(),
    cooldowns: new Map(),
    barrierUntil: 0,
    barrierLayers: 0,
    slowUntil: 0,
    dashUntil: 0,
  };
}

export function makeCtx(seed = 5): GameContext {
  const world = new World(makeRng(seed));
  const ctx: GameContext = {
    world, player: 0, hash: new SpatialHash(40), fx: new FX(), audio: new AudioBus(),
    time: { elapsed: 0, hitStop: 0 }, director: { budget: 0, bossSpawned: false, bossDead: false },
    stats: freshStats(), passives: new Map<string, number>(), input: { axis: () => ({ x: 0, y: 0 }), aim: () => ({ x: 1, y: 0 }) },
    rng: world.rng, seed: seed, camera: { x: 0, y: 0 }, screen: { shake: 0 },
    events: { onLevelUp: () => {}, onDeath: () => {}, onVictory: () => {} },
    equip: freshEquip(),
    skills: freshSkills(),
    run: freshRunState(),
  };
  ctx.player = createPlayer(ctx);
  return ctx;
}

/** First obstacle found scanning outwards from the origin — tests need a concrete one. */
export function findObstacle(seed: number): { o: Obstacle; cx: number; cy: number } {
  for (let cx = -14; cx <= 14; cx++) {
    for (let cy = -14; cy <= 14; cy++) {
      const o = cellObstacle(seed, cx, cy);
      if (o) return { o, cx, cy };
    }
  }
  throw new Error('no obstacle within range of the origin');
}
