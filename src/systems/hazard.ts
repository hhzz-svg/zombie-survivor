import type { GameContext } from '../ctx';
import { Transform, Hazard } from '../components';
import { damagePlayer } from './combat';
import { tr } from '../i18n';

const TICK = 0.5;

/**
 * Lingering ground hazards. They tick rather than damaging per frame, so standing in acid for
 * half a second is a mistake and not instant death — and so the damage stays independent of
 * frame rate, which the deterministic sim requires.
 *
 * Only the player is affected. The horde walking through its own acid would read as a bug, and
 * a boss that kills its own adds would be fighting itself.
 */
export function hazardSystem(ctx: GameContext, _dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform);
  for (const e of w.query(Hazard, Transform)) {
    const h = w.get(e, Hazard)!;
    if (ctx.time.elapsed >= h.until) {
      w.destroy(e);
      continue;
    }
    if (!pt || ctx.time.elapsed < h.nextTick) continue;
    const t = w.get(e, Transform)!;
    if (Math.hypot(pt.x - t.x, pt.y - t.y) > h.r) continue;
    h.nextTick = ctx.time.elapsed + TICK;
    damagePlayer(ctx, h.dps * TICK, tr('腐蚀酸池', 'Corrosive acid pool'), false);
  }
}
