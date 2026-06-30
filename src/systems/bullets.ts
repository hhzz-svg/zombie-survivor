import type { GameContext } from '../ctx';
import { Transform, Collider, Bullet, Health } from '../components';
import { damageEnemy, damagePlayer } from './combat';

/**
 * Bullet collisions. Player bullets hit enemies (with pierce + a per-bullet hit set so one bullet
 * never double-hits the same enemy); enemy bullets hit the player. Enemy positions are read from
 * the spatial hash built at the top of the step.
 */
export function bulletSystem(ctx: GameContext, _dt: number): void {
  const w = ctx.world;
  const neigh: number[] = [];
  const pt = w.get(ctx.player, Transform)!;
  const pc = w.get(ctx.player, Collider)!;

  for (const e of w.query(Bullet, Transform, Collider)) {
    const b = w.get(e, Bullet)!;
    const t = w.get(e, Transform)!;
    const c = w.get(e, Collider)!;

    if (b.team === 'player') {
      ctx.hash.query(t.x, t.y, c.r + 24, neigh);
      for (const o of neigh) {
        if (b.hit.has(o)) continue;
        const ot = w.get(o, Transform);
        const oc = w.get(o, Collider);
        const oh = w.get(o, Health);
        if (!ot || !oc || !oh) continue;
        const rr = c.r + oc.r;
        if ((ot.x - t.x) ** 2 + (ot.y - t.y) ** 2 <= rr * rr) {
          b.hit.add(o);
          const d = Math.hypot(ot.x - t.x, ot.y - t.y) || 1;
          damageEnemy(ctx, o, b.dmg, (ot.x - t.x) / d, (ot.y - t.y) / d, b.knockback, b.crit);
          if (b.pierce <= 0) {
            w.destroy(e);
            break;
          }
          b.pierce--;
        }
      }
    } else {
      const rr = c.r + pc.r;
      if ((pt.x - t.x) ** 2 + (pt.y - t.y) ** 2 <= rr * rr) {
        damagePlayer(ctx, b.dmg, '远程感染弹命中');
        w.destroy(e);
      }
    }
  }
}
