import type { GameContext } from '../ctx';
import type { Entity } from '../ecs/world';
import { Transform, Velocity, Collider, Enemy, Wingman, Barrel } from '../components';
import {
  OBSTACLE_CELL, BARREL_FUSE, BARREL_RADIUS, BARREL_DAMAGE, cellBarrel, resolveCircle,
} from '../data/obstacles';
import { spawnBarrel } from '../factory';
import { explode } from './combat';
import { tr } from '../i18n';

/**
 * Terrain response. Anything that walks (player, horde, squad) gets pushed out of cover and
 * slides along its face instead of sticking to it — without the slide, hugging a wall would
 * stop movement dead.
 *
 * There is deliberately NO pathfinding: cover is convex, sparse and has no concave pockets, so
 * "steer tangentially, then slide on contact" reads as zombies shouldering along a wall, which
 * is both cheap and exactly the behaviour this genre wants. Do not add A* here.
 */
export function blockerSystem(ctx: GameContext): void {
  const w = ctx.world;
  resolveEntity(ctx, ctx.player, 0);
  for (const e of w.query(Enemy, Transform)) {
    const en = w.get(e, Enemy)!;
    if (en.def.isBoss) continue; // the tyrant crushes straight through cover
    resolveEntity(ctx, e, en.def.radius);
  }
  for (const e of w.query(Wingman, Transform)) resolveEntity(ctx, e, 10);
}

function resolveEntity(ctx: GameContext, e: Entity, fallbackRadius: number): void {
  const t = ctx.world.get(e, Transform);
  if (!t) return;
  const r = ctx.world.get(e, Collider)?.r ?? fallbackRadius;
  if (r <= 0) return;
  const res = resolveCircle(ctx.seed, t.x, t.y, r);
  if (!res.hit) return;
  t.x = res.x;
  t.y = res.y;
  const v = ctx.world.get(e, Velocity);
  if (v) {
    // Cancel only the component pushing into the surface; the rest becomes a slide.
    const into = v.x * res.nx + v.y * res.ny;
    if (into < 0) {
      v.x -= res.nx * into;
      v.y -= res.ny * into;
    }
  }
}

/** How far ahead of the player barrel cells are materialised (just past the screen edge). */
const BARREL_ACTIVATE_RADIUS = 760;

/**
 * Barrels are entities (they have HP and they die), but which cells hold one is still a pure
 * function of the seed. A cell is materialised once, when the player first comes near, and its
 * key is remembered — so a barrel the player blew up never respawns on the way back.
 */
export function barrelSystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform);
  if (pt) {
    const seen = (ctx.director.activatedCells ??= new Set<string>());
    const c0 = Math.floor((pt.x - BARREL_ACTIVATE_RADIUS) / OBSTACLE_CELL);
    const c1 = Math.floor((pt.x + BARREL_ACTIVATE_RADIUS) / OBSTACLE_CELL);
    const r0 = Math.floor((pt.y - BARREL_ACTIVATE_RADIUS) / OBSTACLE_CELL);
    const r1 = Math.floor((pt.y + BARREL_ACTIVATE_RADIUS) / OBSTACLE_CELL);
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        const key = `${cx},${cy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const b = cellBarrel(ctx.seed, cx, cy);
        if (b) spawnBarrel(ctx, b.x, b.y);
      }
    }
  }

  for (const e of w.query(Barrel, Transform)) {
    const b = w.get(e, Barrel)!;
    if (b.fuse <= 0) continue; // unlit
    b.fuse -= dt;
    const t = w.get(e, Transform)!;
    if (b.fuse > 0) {
      ctx.fx.spark(t.x, t.y - 6, 0, -1, 1, '#ffb060', 90, ctx.rng);
      continue;
    }
    const x = t.x;
    const y = t.y;
    w.destroy(e); // gone before the blast, so it cannot re-trigger itself
    explode(ctx, x, y, BARREL_RADIUS, BARREL_DAMAGE, true, tr('油桶爆炸', 'Barrel explosion'));
    ctx.fx.shockwave(x, y, BARREL_RADIUS, '#ff9b35', 0.42);
    ctx.fx.flash(x, y, 44, '#fff3d6', '#ff9b35', 0.2);
    ctx.screen.shake = Math.max(ctx.screen.shake, 13);
  }
}

/** Light a barrel's fuse. Called from damageEnemy when a barrel's HP runs out. */
export function igniteBarrel(ctx: GameContext, e: Entity): void {
  const b = ctx.world.get(e, Barrel);
  if (!b || b.fuse > 0) return;
  b.fuse = BARREL_FUSE;
  const t = ctx.world.get(e, Transform);
  if (t) {
    ctx.fx.flash(t.x, t.y, 16, '#fff3d6', '#ff9b35', 0.12);
    ctx.fx.text(t.x, t.y - 18, '!', '#ff9b35', 20);
  }
  ctx.audio.pickup();
}
