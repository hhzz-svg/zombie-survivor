import type { GameContext } from '../ctx';
import type { Entity } from '../ecs/world';
import { Transform, Health, Enemy } from '../components';
import { spawnGem, spawnMedkit, spawnCoin } from '../factory';
import { COIN_DROP, DEATH_DANCE_CAP } from '../data/equipment';
import { buffActive } from './equipment';
import { barrierAbsorb } from './skills';

/** Shared damage resolution — used by bullets, nova, and explosions so the rules live in one place. */

export function damagePlayer(ctx: GameContext, dmg: number, cause = '感染者近身攻击'): void {
  const h = ctx.world.get(ctx.player, Health)!;
  if (h.invuln > 0 || h.hp <= 0) return;
  if (barrierAbsorb(ctx)) return;
  // Shield absorbs one hit completely, consuming one stacked layer.
  if (ctx.equip.shield > 0) {
    ctx.equip.shield--;
    const pt = ctx.world.get(ctx.player, Transform);
    if (pt) {
      ctx.fx.burst(pt.x, pt.y, 14, '#5fb8ff', 200, ctx.rng);
      ctx.fx.flash(pt.x, pt.y, 22, '#ffffff', '#5fb8ff', 0.18);
    }
    ctx.audio.pickup();
    return;
  }
  h.hp -= dmg;
  h.invuln = 0.6;
  h.flash = 0.2;
  ctx.time.hitStop = Math.max(ctx.time.hitStop, 55);
  ctx.screen.shake = Math.max(ctx.screen.shake, 9);
  ctx.audio.hurt();
  ctx.vfx?.onPlayerHit?.(cause);
  if (h.hp <= 0) {
    h.hp = 0;
    ctx.events.onDeath();
  }
}

export function damageEnemy(
  ctx: GameContext,
  e: Entity,
  dmg: number,
  dx: number,
  dy: number,
  knock: number,
  crit = false,
): void {
  const h = ctx.world.get(e, Health);
  const t = ctx.world.get(e, Transform);
  if (!h || !t || h.hp <= 0) return;
  h.hp -= dmg;
  h.flash = 0.08;
  if (crit) {
    ctx.fx.text(t.x, t.y - 14, String(Math.round(dmg)) + '!', '#ff5252');
    ctx.fx.flash(t.x, t.y, 12, '#fff3b0', '#ff8a3c', 0.08);
  } else {
    ctx.fx.text(t.x, t.y - 12, String(Math.round(dmg)), '#ffd86c');
  }
  // directional impact sparks fly off in the bullet's travel direction
  ctx.fx.spark(t.x, t.y, dx, dy, crit ? 7 : 4, '#ffcf8a', 200, ctx.rng);
  if (knock) {
    t.x += dx * knock * 0.02;
    t.y += dy * knock * 0.02;
    // hard hits leave a translucent recoil afterimage of the sprite
    if (ctx.vfx && knock >= 120) {
      const en = ctx.world.get(e, Enemy);
      const pt = ctx.world.get(ctx.player, Transform);
      if (en && pt) ctx.vfx.onEnemyKnocked(t.x, t.y, en.def.id, en.def.radius, en.def.isBoss, pt.x - t.x < 0);
    }
  }
  if (h.hp <= 0) killEnemy(ctx, e);
}

export function killEnemy(ctx: GameContext, e: Entity): void {
  const en = ctx.world.get(e, Enemy);
  const t = ctx.world.get(e, Transform);
  if (!en || !t) return;
  const def = en.def;
  const x = t.x;
  const y = t.y;
  ctx.stats.kills++;
  if (ctx.vfx) {
    const pt = ctx.world.get(ctx.player, Transform);
    ctx.vfx.onEnemyKilled(x, y, def.id, def.radius, def.isBoss, pt ? pt.x - x < 0 : false);
    ctx.vfx.onBloodSplat(x, y, def.radius);
  }
  ctx.world.destroy(e); // remove BEFORE any explosion so it can't re-hit itself
  spawnGem(ctx, x, y, def.xp);

  // Gold coin drop with ±20% jitter.
  const baseCoins = COIN_DROP[def.id] ?? 2;
  const coinMul = buffActive(ctx, 'coinDouble') ? 2 : 1;
  const coins = Math.max(1, Math.round(baseCoins * (0.8 + ctx.rng() * 0.4) * coinMul));
  spawnCoin(ctx, x, y, coins);

  if (ctx.stats.lifesteal > 0) {
    const ph = ctx.world.get(ctx.player, Health);
    if (ph) ph.hp = Math.min(ph.max, ph.hp + ctx.stats.lifesteal);
  }
  // Death-dance: while the buff is active, +5% damage per kill, capped at 10 stacks (50%).
  if (buffActive(ctx, 'deathDance') && ctx.equip.deathDanceStacks < DEATH_DANCE_CAP) {
    ctx.equip.deathDanceStacks++;
    ctx.stats.damageMul += 0.05;
  }
  if (!def.isBoss && ctx.rng() < 0.035) spawnMedkit(ctx, x, y, 20);
  ctx.fx.burst(x, y, 10, def.color, 170, ctx.rng);
  ctx.audio.kill();
  if (def.behavior === 'exploder') explode(ctx, x, y, 72, 30);
  if (def.isBoss) {
    ctx.director.bossDead = true;
    ctx.events.onVictory();
  }
}

export function explode(ctx: GameContext, x: number, y: number, radius: number, dmg: number): void {
  const neigh: number[] = [];
  ctx.hash.query(x, y, radius, neigh);
  for (const o of neigh) {
    const ot = ctx.world.get(o, Transform);
    const oh = ctx.world.get(o, Health);
    if (!ot || !oh) continue;
    const d = Math.hypot(ot.x - x, ot.y - y);
    if (d <= radius) damageEnemy(ctx, o, dmg, (ot.x - x) / (d || 1), (ot.y - y) / (d || 1), 80);
  }
  const pt = ctx.world.get(ctx.player, Transform)!;
  if (Math.hypot(pt.x - x, pt.y - y) <= radius + 14) damagePlayer(ctx, dmg, '爆裂感染者自爆');
  ctx.fx.burst(x, y, 16, '#ffb060', 240, ctx.rng);
  ctx.screen.shake = Math.max(ctx.screen.shake, 6);
  ctx.audio.explode();
}
