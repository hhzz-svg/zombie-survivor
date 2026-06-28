import { describe, expect, it } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { GameContext, PlayerStats, EquipmentState, SkillState } from '../src/ctx';
import { PLAYER_BASE, currentRunStage, hordeCapAt, xpToNext, WAVE } from '../src/data/balance';
import { createPlayer, spawnBoss } from '../src/factory';
import { Bullet, Enemy, Health, Transform, type EnemyRuntime } from '../src/components';
import { directorSystem } from '../src/systems/spawn';
import { enemyAISystem } from '../src/systems/enemyAI';

class RecordingFX extends FX {
  shockwaves = 0;

  override shockwave(x: number, y: number, r: number, color?: string, life?: number): void {
    this.shockwaves++;
    super.shockwave(x, y, r, color, life);
  }
}

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

function freshSkills(): SkillState {
  return {
    owned: new Set(),
    cooldowns: new Map(),
    barrierUntil: 0,
    barrierLayers: 0,
    slowUntil: 0,
    dashUntil: 0,
  };
}

function makeCtx(fx: FX = new FX()): GameContext {
  const world = new World(makeRng(9));
  const ctx: GameContext = {
    world, player: 0, hash: new SpatialHash(40), fx, audio: new AudioBus(),
    time: { elapsed: 0, hitStop: 0 }, director: { budget: 0, bossSpawned: false, bossDead: false },
    stats: freshStats(), input: { axis: () => ({ x: 0, y: 0 }), aim: () => ({ x: 1, y: 0 }) },
    rng: world.rng, camera: { x: 0, y: 0 }, screen: { shake: 0 },
    events: { onLevelUp: () => {}, onDeath: () => {}, onVictory: () => {} },
    equip: freshEquip(),
    skills: freshSkills(),
  };
  ctx.player = createPlayer(ctx);
  return ctx;
}

describe('run stages and horde director', () => {
  it('raises the horde cap across visible run stages', () => {
    expect(currentRunStage(0).index).toBe(1);
    expect(currentRunStage(65).index).toBe(2);
    expect(currentRunStage(125).index).toBe(3);
    expect(currentRunStage(185).index).toBe(4);
    expect(currentRunStage(WAVE.bossAt - 5).index).toBe(5);

    expect(hordeCapAt(0)).toBeLessThan(hordeCapAt(65));
    expect(hordeCapAt(65)).toBeLessThan(hordeCapAt(125));
    expect(hordeCapAt(125)).toBeLessThan(hordeCapAt(185));
  });

  it('uses the current stage cap instead of the full late-game cap', () => {
    const early = makeCtx();
    early.director.budget = 100000;
    directorSystem(early, 0);
    expect(early.world.query(Enemy).length).toBe(hordeCapAt(0));

    const late = makeCtx();
    late.time.elapsed = WAVE.bossAt - 5;
    late.director.budget = 100000;
    directorSystem(late, 0);
    expect(late.world.query(Enemy).length).toBe(hordeCapAt(late.time.elapsed));
    expect(late.world.query(Enemy).length).toBeGreaterThan(early.world.query(Enemy).length);
  });

  it('telegraphs the boss arrival before spawning the boss', () => {
    const fx = new RecordingFX();
    const ctx = makeCtx(fx);
    ctx.time.elapsed = WAVE.bossAt - 10;

    directorSystem(ctx, 0);

    expect(ctx.director.bossSpawned).toBe(false);
    expect(ctx.world.query(Enemy).some((e) => ctx.world.get(e, Enemy)!.def.isBoss)).toBe(false);
    expect(fx.shockwaves).toBeGreaterThan(0);
    expect(ctx.screen.shake).toBeGreaterThanOrEqual(7);
  });
});

describe('boss combat skills', () => {
  it('fires radial bullets and a shockwave during the boss fight', () => {
    const fx = new RecordingFX();
    const ctx = makeCtx(fx);
    ctx.time.elapsed = WAVE.bossAt;
    const boss = spawnBoss(ctx);
    const bt = ctx.world.get(boss, Transform)!;
    bt.x = 90;
    bt.y = 0;
    const bossState = ctx.world.get(boss, Enemy)! as EnemyRuntime & { volleyCd: number; slamCd: number };
    bossState.volleyCd = 0;
    bossState.slamCd = 0;
    ctx.screen.shake = 0;

    const playerHp = ctx.world.get(ctx.player, Health)!.hp;
    enemyAISystem(ctx, 1 / 60);

    const enemyBullets = ctx.world.query(Bullet).filter((e) => ctx.world.get(e, Bullet)!.team === 'enemy');
    expect(enemyBullets.length).toBeGreaterThanOrEqual(8);
    expect(fx.shockwaves).toBeGreaterThan(0);
    expect(ctx.world.get(ctx.player, Health)!.hp).toBeLessThan(playerHp);
    expect(ctx.screen.shake).toBeGreaterThanOrEqual(12);
  });
});
