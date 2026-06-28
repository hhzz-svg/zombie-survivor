import { describe, expect, it } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { SpatialHash } from '../src/ecs/spatialHash';
import { FX } from '../src/fx/fx';
import { AudioBus } from '../src/audio/audio';
import type { GameContext, PlayerStats, EquipmentState, SkillState } from '../src/ctx';
import { PLAYER_BASE, xpToNext } from '../src/data/balance';
import { ENEMIES } from '../src/data/enemies';
import { createPlayer, spawnEnemyAt } from '../src/factory';
import { Health, Transform, Velocity } from '../src/components';
import { currentShopOffers } from '../src/shop';
import { buySkill, skillCooldownRemaining, skillSystem, slowActive, useSkill } from '../src/systems/skills';
import { damagePlayer } from '../src/systems/combat';
import { enemyAISystem } from '../src/systems/enemyAI';
import { rebuildEnemyHash } from '../src/systems/pipeline';

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

function makeCtx(): GameContext {
  const world = new World(makeRng(5));
  const ctx: GameContext = {
    world, player: 0, hash: new SpatialHash(40), fx: new FX(), audio: new AudioBus(),
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

describe('shop skill offers', () => {
  it('keeps skills out of the shop before stage 3', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = 65;

    const offers = currentShopOffers(ctx);

    expect(offers.some((offer) => offer.type === 'skill')).toBe(false);
  });

  it('adds a skill offer from stage 3 and removes owned skills', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = 125;

    const offers = currentShopOffers(ctx);
    const skill = offers.find((offer) => offer.type === 'skill');

    expect(skill?.id).toBe('dash');
    ctx.skills.owned.add('dash');
    expect(currentShopOffers(ctx).some((offer) => offer.type === 'skill' && offer.id === 'dash')).toBe(false);
  });
});

describe('active skills', () => {
  it('buys a run skill once and starts cooldown when used', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = 125;
    ctx.equip.gold = 100;

    expect(buySkill(ctx, 'dash')).toBe(true);
    expect(buySkill(ctx, 'dash')).toBe(false);
    expect(ctx.skills.owned.has('dash')).toBe(true);
    expect(useSkill(ctx, 'KeyZ')).toBe(true);
    expect(skillCooldownRemaining(ctx, 'dash')).toBeGreaterThan(7);
    expect(useSkill(ctx, 'KeyZ')).toBe(false);

    ctx.time.elapsed += 8.1;
    skillSystem(ctx, 1 / 60);

    expect(skillCooldownRemaining(ctx, 'dash')).toBe(0);
    expect(useSkill(ctx, 'KeyZ')).toBe(true);
  });

  it('dash moves the player in the aim direction without changing health', () => {
    const ctx = makeCtx();
    ctx.skills.owned.add('dash');
    const pt = ctx.world.get(ctx.player, Transform)!;
    const hp = ctx.world.get(ctx.player, Health)!;
    const hpBefore = hp.hp;

    expect(useSkill(ctx, 'KeyZ')).toBe(true);

    expect(pt.x).toBeCloseTo(160);
    expect(pt.y).toBeCloseTo(0);
    expect(hp.hp).toBe(hpBefore);
    expect(hp.invuln).toBeGreaterThanOrEqual(0.25);
  });

  it('burst damages nearby enemies only', () => {
    const ctx = makeCtx();
    ctx.skills.owned.add('burst');
    const near = spawnEnemyAt(ctx, ENEMIES.walker!, 80, 0);
    const far = spawnEnemyAt(ctx, ENEMIES.brute!, 260, 0);
    rebuildEnemyHash(ctx);

    expect(useSkill(ctx, 'KeyX')).toBe(true);

    expect(ctx.world.get(near, Health)?.hp ?? 0).toBeLessThan(ENEMIES.walker!.hp);
    expect(ctx.world.get(far, Health)!.hp).toBeCloseTo(ENEMIES.brute!.hp);
  });

  it('barrier absorbs damage with temporary layers', () => {
    const ctx = makeCtx();
    ctx.skills.owned.add('barrier');
    const hp = ctx.world.get(ctx.player, Health)!;

    expect(useSkill(ctx, 'KeyC')).toBe(true);
    damagePlayer(ctx, 20);
    damagePlayer(ctx, 20);
    damagePlayer(ctx, 20);

    expect(hp.hp).toBe(hp.max);
    expect(ctx.skills.barrierLayers).toBe(0);
    damagePlayer(ctx, 20);
    expect(hp.hp).toBe(hp.max - 20);
  });

  it('slow expires and reduces enemy movement while active', () => {
    const ctx = makeCtx();
    ctx.skills.owned.add('slow');
    const enemy = spawnEnemyAt(ctx, ENEMIES.runner!, 100, 0);
    rebuildEnemyHash(ctx);

    enemyAISystem(ctx, 1 / 60);
    const normalSpeed = Math.hypot(
      ctx.world.get(enemy, Velocity)!.x,
      ctx.world.get(enemy, Velocity)!.y,
    );

    expect(useSkill(ctx, 'KeyV')).toBe(true);
    expect(slowActive(ctx)).toBe(true);
    enemyAISystem(ctx, 1 / 60);
    const slowedSpeed = Math.hypot(
      ctx.world.get(enemy, Velocity)!.x,
      ctx.world.get(enemy, Velocity)!.y,
    );

    expect(slowedSpeed).toBeLessThan(normalSpeed * 0.8);
    ctx.time.elapsed += 6.1;
    skillSystem(ctx, 1 / 60);
    expect(slowActive(ctx)).toBe(false);
  });
});
