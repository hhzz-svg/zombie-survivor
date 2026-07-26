import type { GameContext } from '../ctx';
import type { Entity } from '../ecs/world';
import { Transform, Renderable, CurseAltar } from '../components';

/**
 * Blood-curse altars: one rises per stage from stage 2 on. Walking into one
 * accepts a pact — permanently harder spawns and more elites this run, in
 * exchange for richer XP and gold. The player chooses their own risk dial.
 */

export const CURSE_TOUCH_RADIUS = 34;
export const CURSE_SPAWN_PER_STACK = 0.15;
export const CURSE_ELITE_PER_STACK = 0.03;
export const CURSE_XP_PER_STACK = 0.2;
export const CURSE_GOLD_PER_STACK = 0.1;

export function curseSpawnMul(ctx: GameContext): number {
  return 1 + ctx.run.curse * CURSE_SPAWN_PER_STACK;
}

export function curseEliteBonus(ctx: GameContext): number {
  return ctx.run.curse * CURSE_ELITE_PER_STACK;
}

export function curseXpMul(ctx: GameContext): number {
  return 1 + ctx.run.curse * CURSE_XP_PER_STACK;
}

export function curseGoldMul(ctx: GameContext): number {
  return 1 + ctx.run.curse * CURSE_GOLD_PER_STACK;
}

/** Raise an altar at a readable distance from the player. */
export function spawnCurseAltar(ctx: GameContext): Entity {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform);
  const a = ctx.rng() * Math.PI * 2;
  const r = 380 + ctx.rng() * 140;
  const e = w.create();
  w.add(e, Transform, { x: (pt?.x ?? 0) + Math.cos(a) * r, y: (pt?.y ?? 0) + Math.sin(a) * r, rot: 0 });
  w.add(e, CurseAltar, true);
  w.add(e, Renderable, { shape: 'rect', r: 14, color: '#8a2733' });
  return e;
}

/** Touch check: accepting the pact consumes the altar. */
export function curseAltarSystem(ctx: GameContext, _dt: number): void {
  const pt = ctx.world.get(ctx.player, Transform);
  if (!pt) return;
  for (const e of ctx.world.query(CurseAltar, Transform)) {
    const t = ctx.world.get(e, Transform)!;
    const d2 = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2;
    if (d2 > CURSE_TOUCH_RADIUS * CURSE_TOUCH_RADIUS) continue;
    ctx.world.destroy(e);
    ctx.run.curse++;
    ctx.fx.shockwave(t.x, t.y, 120, '#ff4d5e', 0.5);
    ctx.fx.burst(t.x, t.y, 22, '#c22b3d', 260, ctx.rng);
    ctx.fx.text(t.x, t.y - 30, `血怨 ×${ctx.run.curse}`, '#ff5a6a', 18);
    ctx.screen.shake = Math.max(ctx.screen.shake, 8);
    ctx.time.hitStop = Math.max(ctx.time.hitStop, 35);
    ctx.audio.boss();
    ctx.vfx?.onAnnounce?.(
      `血怨诅咒 ×${ctx.run.curse}`,
      `刷怪 +${Math.round(ctx.run.curse * CURSE_SPAWN_PER_STACK * 100)}% · 精英 +${Math.round(ctx.run.curse * CURSE_ELITE_PER_STACK * 100)}% ⇄ 经验 +${Math.round(ctx.run.curse * CURSE_XP_PER_STACK * 100)}% · 金币 +${Math.round(ctx.run.curse * CURSE_GOLD_PER_STACK * 100)}%`,
      'curse',
    );
  }
}
