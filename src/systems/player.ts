import type { GameContext } from '../ctx';
import { Transform, Collider, Health, Enemy, XPGem, GoldCoin, Medkit } from '../components';
import { PLAYER_BASE, xpToNext } from '../data/balance';
import { damagePlayer, killEnemy } from './combat';
import { buffActive } from './equipment';
import { pickupRangeMultiplier } from '../runFlow';

/** Player ↔ enemy body contact (with i-frames) and the exploder's contact detonation. */
export function contactSystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform)!;
  const pc = w.get(ctx.player, Collider)!;
  const ph = w.get(ctx.player, Health)!;
  if (ph.invuln > 0) ph.invuln -= dt;
  if (ph.flash > 0) ph.flash -= dt;

  const neigh: number[] = [];
  ctx.hash.query(pt.x, pt.y, pc.r + 26, neigh);
  for (const o of neigh) {
    const en = w.get(o, Enemy);
    const ot = w.get(o, Transform);
    const oc = w.get(o, Collider);
    if (!en || !ot || !oc) continue;
    const rr = pc.r + oc.r;
    if ((ot.x - pt.x) ** 2 + (ot.y - pt.y) ** 2 <= rr * rr) {
      if (en.def.behavior === 'exploder') killEnemy(ctx, o);
      else damagePlayer(ctx, en.def.contactDmg);
    }
  }
}

/** XP gems: magnet toward the player within pickup range, collect on touch, grant levels. */
export function pickupSystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform)!;
  const range = PLAYER_BASE.pickupRange * pickupRangeMultiplier(ctx.time.elapsed, ctx.stats.magnet);
  const r2 = range * range;
  for (const e of w.query(XPGem, Transform)) {
    const t = w.get(e, Transform)!;
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) {
      const d = Math.sqrt(d2) || 1;
      t.x += (dx / d) * 260 * dt;
      t.y += (dy / d) * 260 * dt;
      if (d2 <= 18 * 18) {
        collectXp(ctx, w.get(e, XPGem)!.value);
        ctx.audio.pickup();
        w.destroy(e);
      }
    }
  }

  for (const e of w.query(Medkit, Transform)) {
    const t = w.get(e, Transform)!;
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) {
      const d = Math.sqrt(d2) || 1;
      t.x += (dx / d) * 220 * dt;
      t.y += (dy / d) * 220 * dt;
      if (d2 <= 22 * 22) {
        const ph = w.get(ctx.player, Health)!;
        ph.hp = Math.min(ph.max, ph.hp + w.get(e, Medkit)!.heal);
        ctx.audio.pickup();
        w.destroy(e);
      }
    }
  }

  // Gold coins: magnet within pickup range, collect on touch.
  for (const e of w.query(GoldCoin, Transform)) {
    const t = w.get(e, Transform)!;
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) {
      const d = Math.sqrt(d2) || 1;
      t.x += (dx / d) * 300 * dt;
      t.y += (dy / d) * 300 * dt;
      if (d2 <= 20 * 20) {
        ctx.equip.gold += w.get(e, GoldCoin)!.value;
        ctx.audio.pickup();
        w.destroy(e);
      }
    }
  }
}

function collectXp(ctx: GameContext, value: number): void {
  // Magnet buff grants +15% XP gain while active.
  const xpMul = buffActive(ctx, 'magnet') ? 1.15 : 1;
  ctx.stats.xp += Math.round(value * xpMul);
  while (ctx.stats.xp >= ctx.stats.xpToNext) {
    ctx.stats.xp -= ctx.stats.xpToNext;
    ctx.stats.level++;
    ctx.stats.xpToNext = xpToNext(ctx.stats.level);
    ctx.events.onLevelUp();
  }
}
