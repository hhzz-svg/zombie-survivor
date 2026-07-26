import type { GameContext } from './ctx';
import type { Entity } from './ecs/world';
import type { EnemyDef, WeaponDef } from './data/schemas';
import type { EliteAffix } from './data/elites';
import {
  Transform, Velocity, Health, Collider, Renderable, Enemy, Bullet, Lifetime, XPGem, GoldCoin, Medkit, PlayerTag, Aim, Loadout, SupplyCrate, Survivor, Wingman,
} from './components';
import { PLAYER_BASE, hpScale, WAVE, SUPPLY_FALL_SECONDS } from './data/balance';
import { WEAPONS, STARTER_WEAPON } from './data/weapons';
import { ENEMIES } from './data/enemies';
import { SURVIVOR_WAIT, type WingmanDef } from './data/wingmen';

/** Entity construction lives here so spawning is consistent across game, sim, and tests. */

export function createPlayer(ctx: GameContext, weaponId: string = STARTER_WEAPON): Entity {
  const w = ctx.world;
  const e = w.create();
  const weapon = WEAPONS[weaponId] ?? WEAPONS[STARTER_WEAPON]!;
  w.add(e, Transform, { x: 0, y: 0, rot: 0 });
  w.add(e, Velocity, { x: 0, y: 0 });
  w.add(e, Health, { hp: ctx.stats.maxHp, max: ctx.stats.maxHp, invuln: 0, flash: 0 });
  w.add(e, Collider, { r: PLAYER_BASE.radius });
  w.add(e, PlayerTag, true);
  w.add(e, Aim, { x: 1, y: 0 });
  w.add(e, Loadout, { weapons: [{ def: weapon, level: 1, cd: 0 }], activeWeapon: weapon.id });
  return e;
}

export function spawnEnemyAt(ctx: GameContext, def: EnemyDef, x: number, y: number, elite?: EliteAffix): Entity {
  const w = ctx.world;
  const e = w.create();
  const hp = def.hp * (def.isBoss ? 1 : hpScale(ctx.time.elapsed)) * (elite?.hpMul ?? 1);
  const radius = def.radius * (elite?.radiusMul ?? 1);
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Velocity, { x: 0, y: 0 });
  w.add(e, Health, { hp, max: hp, invuln: 0, flash: 0 });
  w.add(e, Collider, { r: radius });
  w.add(e, Renderable, { shape: 'circle', r: radius, color: def.color });
  w.add(e, Enemy, {
    def,
    t: 0,
    shootCd: 1 + ctx.rng() * 1.5,
    summonCd: 5,
    volleyCd: 2.2,
    slamCd: 6.5,
    enraged: false,
    elite,
  });
  return e;
}

export function spawnEnemyRing(ctx: GameContext, def: EnemyDef, elite?: EliteAffix): Entity {
  const pt = ctx.world.get(ctx.player, Transform)!;
  const a = ctx.rng() * Math.PI * 2;
  return spawnEnemyAt(ctx, def, pt.x + Math.cos(a) * WAVE.spawnRadius, pt.y + Math.sin(a) * WAVE.spawnRadius, elite);
}

export function spawnBoss(ctx: GameContext, hpMul = 1): Entity {
  const pt = ctx.world.get(ctx.player, Transform)!;
  const a = ctx.rng() * Math.PI * 2;
  const boss = ENEMIES['boss']!;
  ctx.audio.boss();
  ctx.screen.shake = Math.max(ctx.screen.shake, 14);
  const e = spawnEnemyAt(ctx, boss, pt.x + Math.cos(a) * 420, pt.y + Math.sin(a) * 420);
  if (hpMul !== 1) {
    const h = ctx.world.get(e, Health)!;
    h.hp *= hpMul;
    h.max *= hpMul;
  }
  return e;
}

/** The golden runner: flees the player and despawns (no rewards) if not hunted down in time. */
export function spawnGoldenRunner(ctx: GameContext): Entity {
  const e = spawnEnemyRing(ctx, ENEMIES['golden']!);
  ctx.world.add(e, Lifetime, { t: 12 });
  return e;
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
  w.add(e, Bullet, {
    dmg, pierce, team: 'player', knockback: def.knockback, crit, hit: new Set<Entity>(),
    style: def.bulletStyle, explodeRadius: def.explodeRadius,
  });
  w.add(e, Lifetime, { t: def.life });
  return e;
}

export function spawnCrate(ctx: GameContext, x: number, y: number): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, SupplyCrate, { landAt: ctx.time.elapsed + SUPPLY_FALL_SECONDS });
  w.add(e, Renderable, { shape: 'rect', r: 14, color: '#c8b273' });
  return e;
}

/** A stranded survivor at a readable distance from the player, on a rescue timer. */
export function spawnSurvivor(ctx: GameContext, def: WingmanDef): Entity {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform);
  const a = ctx.rng() * Math.PI * 2;
  const r = 300 + ctx.rng() * 150;
  const e = w.create();
  w.add(e, Transform, { x: (pt?.x ?? 0) + Math.cos(a) * r, y: (pt?.y ?? 0) + Math.sin(a) * r, rot: 0 });
  w.add(e, Survivor, { def, until: ctx.time.elapsed + SURVIVOR_WAIT });
  w.add(e, Renderable, { shape: 'circle', r: 11, color: def.color });
  return e;
}

/** Convert a rescue into a fighting squadmate occupying `slot`. */
export function spawnWingman(ctx: GameContext, def: WingmanDef, x: number, y: number, slot: number): Entity {
  const w = ctx.world;
  const e = w.create();
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Velocity, { x: 0, y: 0 });
  w.add(e, Health, { hp: def.hp, max: def.hp, invuln: 0, flash: 0 });
  w.add(e, Wingman, { def, slot, cd: def.cooldown, invuln: 0 });
  w.add(e, Renderable, { shape: 'circle', r: 10, color: def.color });
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

export function spawnBossBullet(ctx: GameContext, x: number, y: number, dx: number, dy: number): Entity {
  const w = ctx.world;
  const e = w.create();
  const sp = 255;
  w.add(e, Transform, { x, y, rot: 0 });
  w.add(e, Velocity, { x: dx * sp, y: dy * sp });
  w.add(e, Collider, { r: 7 });
  w.add(e, Renderable, { shape: 'circle', r: 7, color: '#e36aa0' });
  w.add(e, Bullet, { dmg: 14, pierce: 0, team: 'enemy', knockback: 0, crit: false, hit: new Set<Entity>() });
  w.add(e, Lifetime, { t: 3.6 });
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
