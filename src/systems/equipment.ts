import type { GameContext } from '../ctx';
import { Transform, Health } from '../components';
import { damageEnemy } from './combat';
import { EQUIPMENT } from '../data/equipment';

/** True while the given buff item is active (bought and not yet expired). */
export function buffActive(ctx: GameContext, id: string): boolean {
  const until = ctx.equip.buffs.get(id);
  return until !== undefined && ctx.time.elapsed < until;
}

/**
 * Start (or refresh) a timed buff. The stat delta is applied exactly once on the first
 * activation and stored as an undo closure; re-buying while active only refreshes the timer,
 * so effects never stack or drift. Expiry runs the undo in equipmentSystem.
 */
export function startBuff(ctx: GameContext, id: string, duration: number): void {
  const eq = ctx.equip;
  if (!eq.buffUndo.has(id)) eq.buffUndo.set(id, applyBuff(ctx, id));
  eq.buffs.set(id, ctx.time.elapsed + duration);
}

/** Apply a buff's stat bonus and return the matching revert function. */
function applyBuff(ctx: GameContext, id: string): () => void {
  const s = ctx.stats;
  switch (id) {
    case 'boots': {
      const speedDelta = s.moveSpeed * 0.18;
      s.moveSpeed += speedDelta;
      s.damageMul += 0.2;
      return () => {
        s.moveSpeed -= speedDelta;
        s.damageMul -= 0.2;
      };
    }
    case 'magnet':
      s.magnet += 0.6;
      return () => {
        s.magnet -= 0.6;
      };
    case 'berserk':
      s.damageMul += 0.8;
      s.fireRateMul += 0.3;
      return () => {
        s.damageMul -= 0.8;
        s.fireRateMul -= 0.3;
      };
    case 'deathDance':
      ctx.equip.deathDanceStacks = 0;
      return () => {
        // Remove whatever kill-stacks accrued during this window.
        s.damageMul -= ctx.equip.deathDanceStacks * 0.05;
        ctx.equip.deathDanceStacks = 0;
      };
    case 'coinDouble':
      // Effect is read live via buffActive() at coin-drop time; nothing to revert.
      return () => {};
    default:
      return () => {};
  }
}

/**
 * Per-tick equipment maintenance: expire timed buffs, reverting their stat deltas exactly once.
 */
export function equipmentSystem(ctx: GameContext, _dt: number): void {
  const eq = ctx.equip;
  for (const [id, until] of eq.buffs) {
    if (ctx.time.elapsed >= until) {
      const undo = eq.buffUndo.get(id);
      if (undo) undo();
      eq.buffUndo.delete(id);
      eq.buffs.delete(id);
    }
  }
}

/**
 * Attempt to use a charge item bound to the given key code. Spends one charge on success.
 * Returns true if the item was activated.
 */
export function useItem(ctx: GameContext, keyCode: string): boolean {
  const eq = ctx.equip;
  const def = EQUIPMENT.find((e) => e.key === keyCode);
  if (!def || def.kind !== 'charge') return false;
  if ((eq.charges.get(def.id) ?? 0) <= 0) return false;

  switch (def.id) {
    case 'grenade':
      activateGrenade(ctx);
      break;
    case 'heal':
      activateHeal(ctx);
      break;
    case 'berserk':
      activateBerserk(ctx);
      break;
    default:
      return false;
  }

  eq.charges.set(def.id, (eq.charges.get(def.id) ?? 0) - 1);
  return true;
}

function activateGrenade(ctx: GameContext): void {
  const pt = ctx.world.get(ctx.player, Transform);
  if (!pt) return;
  const radius = 180;
  const dmg = 120;
  const neigh: number[] = [];
  ctx.hash.query(pt.x, pt.y, radius, neigh);
  for (const o of neigh) {
    const ot = ctx.world.get(o, Transform);
    const oh = ctx.world.get(o, Health);
    if (!ot || !oh) continue;
    const d = Math.hypot(ot.x - pt.x, ot.y - pt.y);
    if (d <= radius) {
      const nx = (ot.x - pt.x) / (d || 1);
      const ny = (ot.y - pt.y) / (d || 1);
      damageEnemy(ctx, o, dmg * ctx.stats.damageMul, nx, ny, 100);
    }
  }
  ctx.fx.burst(pt.x, pt.y, 24, '#ffb060', 300, ctx.rng);
  ctx.fx.flash(pt.x, pt.y, radius * 0.4, '#fff8e0', '#ff8a3c', 0.2);
  ctx.screen.shake = Math.max(ctx.screen.shake, 12);
  ctx.audio.explode();
}

function activateHeal(ctx: GameContext): void {
  const ph = ctx.world.get(ctx.player, Health);
  if (!ph) return;
  ph.hp = Math.min(ph.max, ph.hp + 40);
  const pt = ctx.world.get(ctx.player, Transform);
  if (pt) {
    ctx.fx.burst(pt.x, pt.y, 10, '#6fef8f', 120, ctx.rng);
    ctx.fx.text(pt.x, pt.y - 20, '+40 HP', '#6fef8f');
  }
  ctx.audio.pickup();
}

function activateBerserk(ctx: GameContext): void {
  // 5 s rage; reuses the timed-buff engine so the bonus is applied/reverted exactly once.
  startBuff(ctx, 'berserk', 5);
  const pt = ctx.world.get(ctx.player, Transform);
  if (pt) {
    ctx.fx.burst(pt.x, pt.y, 16, '#ff5a5a', 180, ctx.rng);
    ctx.fx.flash(pt.x, pt.y, 18, '#ffffff', '#ff3030', 0.12);
  }
  ctx.screen.shake = Math.max(ctx.screen.shake, 6);
  ctx.audio.boss(); // dramatic sound for the rage
}
