import type { GameContext } from './ctx';
import type { Entity } from './ecs/world';
import type { EnemyDef, WeaponDef } from './data/schemas';
import {
  Transform, Velocity, Health, Collider, Renderable, Enemy, Bullet, Lifetime, XPGem, GoldCoin, Medkit, PlayerTag, Aim, Loadout,
} from './components';
import { PLAYER_BASE, hpScale, WAVE } from './data/balance';
import { WEAPONS, STARTER_WEAPON } from './data/weapons';
import { ENEMIES } from './data/enemies';

/** Entity construction lives here so spawning is consistent across game, sim, and tests. */

export function createPlayer(ctx: GameContext): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x: 0, y: 0, rot: 0 });
  w.add(e, Velocity, { x: 0, y: 0 });
  w.add(e, Health, { hp: ctx.stats.maxHp, max: ctx.stats.maxHp, invuln: 0, flash: 0 });
  w.add(e, Collider, { r: PLAYER_BASE.radius });
  w.add(e, PlayerTag, true);
  w.add(e, Aim, { x: 1, y: 0 });
  w.add(e, Loadout, { weapons: [{ def: WEAPONS[STARTER_WEAPON]!, level: 1, cd: 0 }], activeWeapon: STARTER_WEAPON });
  return e;
}

export function spawnEnemyAt(ctx: GameContext, def: EnemyDef, x: number, y: number): Entity {
  const w = ctx.world;
  const e = w.create();
  const hp = def.hp * (def.isBoss ? 1 : hpScale(ctx.time.elapsed));
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Velocity, { x: 0, y: 0 });
  w.add(e, Health, { hp, max: hp, invuln: 0, flash: 0 });
  w.add(e, Collider, { r: def.radius });
  w.add(e, Renderable, { shape: 'circle', r: def.radius, color: def.color });
  w.add(e, Enemy, { def, t: 0, shootCd: 1 + ctx.rng() * 1.5, summonCd: 5, enraged: false });
  return e;
}

export function spawnEnemyRing(ctx: GameContext, def: EnemyDef): Entity {
  const pt = ctx.world.get(ctx.player, Transform)!;
  const a = ctx.rng() * Math.PI * 2;
  return spawnEnemyAt(ctx, def, pt.x + Math.cos(a) * WAVE.spawnRadius, pt.y + Math.sin(a) * WAVE.spawnRadius);
}

export function spawnBoss(ctx: GameContext): Entity {
  const pt = ctx.world.get(ctx.player, Transform)!;
  const a = ctx.rng() * Math.PI * 2;
  const boss = ENEMIES['boss']!;
  ctx.audio.boss();
  ctx.screen.shake = Math.max(ctx.screen.shake, 14);
  return spawnEnemyAt(ctx, boss, pt.x + Math.cos(a) * 420, pt.y + Math.sin(a) * 420);
}

export function spawnBullet(
  ctx: GameContext,
  x: number, y: number, dx: number, dy: number,
  def: WeaponDef, dmg: number, pierce: number, crit = false,
): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Velocity, { x: dx * def.speed, y: dy * def.speed });
  w.add(e, Collider, { r: 5 });
  w.add(e, Renderable, { shape: 'circle', r: 5, color: '#ffe08a' });
  w.add(e, Bullet, { dmg, pierce, team: 'player', knockback: def.knockback, crit, hit: new Set<Entity>() });
  w.add(e, Lifetime, { t: def.life });
  return e;
}

export function spawnEnemyBullet(ctx: GameContext, x: number, y: number, dx: number, dy: number): Entity {
  const w = ctx.world;
  const e = w.create();
  const sp = 215;
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Velocity, { x: dx * sp, y: dy * sp });
  w.add(e, Collider, { r: 6 });
  w.add(e, Renderable, { shape: 'circle', r: 6, color: '#9ef06f' });
  w.add(e, Bullet, { dmg: 10, pierce: 0, team: 'enemy', knockback: 0, crit: false, hit: new Set<Entity>() });
  w.add(e, Lifetime, { t: 3 });
  return e;
}

export function spawnGem(ctx: GameContext, x: number, y: number, value: number): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, XPGem, { value });
  w.add(e, Renderable, { shape: 'gem', r: 5, color: '#62d0ff' });
  return e;
}

export function spawnMedkit(ctx: GameContext, x: number, y: number, heal: number): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Medkit, { heal });
  w.add(e, Renderable, { shape: 'rect', r: 7, color: '#ff5a5a' });
  return e;
}

export function spawnCoin(ctx: GameContext, x: number, y: number, value: number): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, GoldCoin, { value });
  w.add(e, Renderable, { shape: 'circle', r: 5, color: '#ffd700' });
  return e;
}
