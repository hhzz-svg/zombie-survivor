import type { GameContext } from '../ctx';
import type { Entity } from '../ecs/world';
import { Transform, Telegraph, Enemy } from '../components';
import { damagePlayer } from './combat';
import { spawnHazard } from '../factory';
import { ACID_POOL_DPS, ACID_POOL_SECONDS, LASHER_PULL } from '../data/enemies';

/**
 * Telegraphed attacks: a wind-up is placed in the world, drawn as a filling ring, and only
 * resolves when its timer runs out. Everything before this landed instantly, so a hit was
 * never something the player could have avoided — only something that happened to them.
 *
 * The target position is frozen at wind-up time. That is the whole point: stepping out of
 * the marked circle works.
 */
export function startTelegraph(
  ctx: GameContext,
  e: Entity,
  data: {
    kind: 'slam' | 'lash' | 'acid';
    x: number;
    y: number;
    r: number;
    windup: number;
    dmg: number;
    color: string;
    cause: string;
  },
): void {
  if (ctx.world.has(e, Telegraph)) return; // one wind-up at a time
  ctx.world.add(e, Telegraph, {
    kind: data.kind,
    x: data.x,
    y: data.y,
    r: data.r,
    at: ctx.time.elapsed + data.windup,
    total: data.windup,
    dmg: data.dmg,
    color: data.color,
    cause: data.cause,
  });
}

export function telegraphSystem(ctx: GameContext, _dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform);
  if (!pt) return;

  for (const e of w.query(Telegraph)) {
    const tg = w.get(e, Telegraph)!;
    if (ctx.time.elapsed < tg.at) continue;
    w.remove(e, Telegraph);
    // A barrage plants one marker entity per circle so several can be in the air at once;
    // markers exist only to carry the wind-up, so they go when it resolves.
    if (!w.has(e, Enemy)) w.destroy(e);

    if (tg.kind === 'acid') {
      ctx.fx.shockwave(tg.x, tg.y, tg.r, tg.color, 0.3);
      ctx.fx.burst(tg.x, tg.y, 14, tg.color, 170, ctx.rng);
      ctx.audio.explode();
      const d = Math.hypot(pt.x - tg.x, pt.y - tg.y);
      if (d <= tg.r + 12) damagePlayer(ctx, tg.dmg, tg.cause);
      spawnHazard(ctx, tg.x, tg.y, tg.r, ACID_POOL_SECONDS, ACID_POOL_DPS);
      continue;
    }

    if (tg.kind === 'slam') {
      ctx.fx.shockwave(tg.x, tg.y, tg.r, tg.color, 0.38);
      ctx.fx.burst(tg.x, tg.y, 22, tg.color, 220, ctx.rng);
      ctx.screen.shake = Math.max(ctx.screen.shake, 12);
      ctx.audio.explode();
      const d = Math.hypot(pt.x - tg.x, pt.y - tg.y);
      if (d <= tg.r + 12) {
        damagePlayer(ctx, tg.dmg, tg.cause);
        const inv = 1 / (d || 1);
        pt.x += (pt.x - tg.x) * inv * 40;
        pt.y += (pt.y - tg.y) * inv * 40;
      }
      continue;
    }

    // Lash: the hook lands on the caster's CURRENT position, so a caster that got shoved
    // around during the wind-up drags the player somewhere else than the line promised.
    const st = w.get(e, Transform);
    if (!st) continue;
    const dx = st.x - pt.x;
    const dy = st.y - pt.y;
    const d = Math.hypot(dx, dy) || 1;
    ctx.fx.streak(pt.x, pt.y, st.x, st.y, tg.color);
    ctx.audio.hurt();
    const pull = Math.min(LASHER_PULL, d - 24);
    if (pull > 0) {
      pt.x += (dx / d) * pull;
      pt.y += (dy / d) * pull;
    }
    damagePlayer(ctx, tg.dmg, tg.cause);
  }
}
