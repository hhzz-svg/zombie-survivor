import type { GameContext } from '../ctx';
import type { WeaponInst } from '../components';
import { Transform, Aim, Loadout, Health, Collider } from '../components';
import { spawnBullet } from '../factory';
import { rayReach } from '../data/obstacles';
import type { WeaponDef } from '../data/schemas';
import { DESPERATE_HP_FRAC } from '../data/balance';
import { combatMuzzleOffset } from '../render/combatActor';
import { damageEnemy } from './combat';

/** Fires each owned weapon on its cooldown toward the aim vector (manual aim + auto fire). */
export function weaponSystem(ctx: GameContext, dt: number): void {
  const pt = ctx.world.get(ctx.player, Transform)!;
  const pc = ctx.world.get(ctx.player, Collider)!;
  const aim = ctx.world.get(ctx.player, Aim)!;
  const lo = ctx.world.get(ctx.player, Loadout)!;

  for (const wi of lo.weapons) {
    if (wi.def.kind === 'orbit') {
      updateOrbit(ctx, wi, pt.x, pt.y, dt);
      continue;
    }
    wi.cd -= dt * ctx.stats.fireRateMul;
    if (wi.cd > 0) continue;
    wi.cd += wi.def.cooldown;
    fire(ctx, wi, pt.x, pt.y, aim.x, aim.y, pc.r);
  }
}

/**
 * base × damageMul, doubled on a crit roll. The `desperate` trait pays out only while the
 * player is actually in danger, so it rewards staying in the fight instead of kiting safely.
 */
function rollDmg(ctx: GameContext, base: number): { dmg: number; crit: boolean } {
  const crit = ctx.rng() < ctx.stats.crit;
  let mul = ctx.stats.damageMul;
  if (ctx.stats.desperate > 0) {
    const h = ctx.world.get(ctx.player, Health);
    if (h && h.hp < h.max * DESPERATE_HP_FRAC) mul += ctx.stats.desperate;
  }
  return { dmg: base * mul * (crit ? 2 : 1), crit };
}

/** Orbiting blades: advance their angle, damage overlapping enemies with a per-enemy re-hit cooldown. */
function updateOrbit(ctx: GameContext, wi: WeaponInst, px: number, py: number, dt: number): void {
  wi.phase = (wi.phase ?? 0) + wi.def.speed * dt;
  if (!wi.hits) wi.hits = new Map();
  const blades = wi.def.projectiles + ctx.stats.projectileBonus;
  const neigh: number[] = [];
  for (let b = 0; b < blades; b++) {
    const ang = wi.phase + (b / blades) * Math.PI * 2;
    const bx = px + Math.cos(ang) * wi.def.range;
    const by = py + Math.sin(ang) * wi.def.range;
    ctx.hash.query(bx, by, 16, neigh);
    for (const o of neigh) {
      const ot = ctx.world.get(o, Transform);
      const oc = ctx.world.get(o, Collider);
      const oh = ctx.world.get(o, Health);
      if (!ot || !oc || !oh) continue;
      const rr = 14 + oc.r;
      if ((ot.x - bx) ** 2 + (ot.y - by) ** 2 <= rr * rr) {
        const last = wi.hits.get(o) ?? -999;
        if (ctx.time.elapsed - last >= wi.def.cooldown) {
          wi.hits.set(o, ctx.time.elapsed);
          const { dmg, crit } = rollDmg(ctx, wi.def.damage * (1 + 0.25 * (wi.level - 1)));
          const d = Math.hypot(ot.x - bx, ot.y - by) || 1;
          damageEnemy(ctx, o, dmg, (ot.x - bx) / d, (ot.y - by) / d, wi.def.knockback, crit);
        }
      }
    }
  }
}

/**
 * A continuous lance. Cover stops it, which is what makes it a positioning weapon: the beam
 * wants a clean lane, so the terrain decides where you can stand rather than how hard you hit.
 */
function fireBeam(
  ctx: GameContext,
  def: WeaponDef,
  base: number,
  px: number,
  py: number,
  ax: number,
  ay: number,
): void {
  const width = def.width ?? 20;
  const beams = def.projectiles;
  const baseA = Math.atan2(ay, ax);
  const neigh: number[] = [];

  for (let b = 0; b < beams; b++) {
    const a = baseA + (beams > 1 ? (b / (beams - 1) - 0.5) * def.spread : 0);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const len = rayReach(ctx.seed, px, py, dx, dy, def.range);
    const ex = px + dx * len;
    const ey = py + dy * len;

    // One broad query over the beam's bounding circle, then an exact point-to-segment test.
    ctx.hash.query((px + ex) / 2, (py + ey) / 2, len / 2 + width, neigh);
    for (const o of neigh) {
      const ot = ctx.world.get(o, Transform);
      const oc = ctx.world.get(o, Collider);
      if (!ot || !oc) continue;
      const t = Math.max(0, Math.min(len, (ot.x - px) * dx + (ot.y - py) * dy));
      const gap = Math.hypot(ot.x - (px + dx * t), ot.y - (py + dy * t));
      if (gap > width / 2 + oc.r) continue;
      const { dmg, crit } = rollDmg(ctx, base);
      damageEnemy(ctx, o, dmg, dx, dy, def.knockback, crit, true);
    }

    ctx.fx.streak(px, py, ex, ey, '#9fe8ff');
    ctx.fx.flash(ex, ey, width * 0.5, '#eaffff', '#5fd0ff', 0.08);
  }
}

/**
 * Lightning that hops between bodies. The opposite positioning problem to the beam: it wants
 * the horde bunched together, so it rewards letting them close in.
 */
function fireChain(ctx: GameContext, def: WeaponDef, base: number, px: number, py: number): void {
  const JUMP_RANGE = 150;
  const FALLOFF = 0.82;
  const hit = new Set<number>();
  const neigh: number[] = [];
  let fromX = px;
  let fromY = py;
  let damage = base;
  let searchRadius = def.range;

  for (let jump = 0; jump < def.projectiles; jump++) {
    ctx.hash.query(fromX, fromY, searchRadius, neigh);
    let best = -1;
    let bestD = Infinity;
    for (const o of neigh) {
      if (hit.has(o)) continue;
      const ot = ctx.world.get(o, Transform);
      const oh = ctx.world.get(o, Health);
      if (!ot || !oh || oh.hp <= 0) continue;
      const d = Math.hypot(ot.x - fromX, ot.y - fromY);
      if (d < bestD && d <= searchRadius) {
        bestD = d;
        best = o;
      }
    }
    if (best < 0) break; // the chain dies out when the crowd thins — that is the trade

    const ot = ctx.world.get(best, Transform)!;
    const d = bestD || 1;
    const { dmg, crit } = rollDmg(ctx, damage);
    ctx.fx.streak(fromX, fromY, ot.x, ot.y, '#b9ecff');
    ctx.fx.flash(ot.x, ot.y, 11, '#eaffff', '#7fd6ff', 0.1);
    damageEnemy(ctx, best, dmg, (ot.x - fromX) / d, (ot.y - fromY) / d, def.knockback, crit);

    hit.add(best);
    fromX = ot.x;
    fromY = ot.y;
    damage *= FALLOFF;
    searchRadius = JUMP_RANGE;
  }
  if (hit.size > 0) ctx.audio.nova();
}

function fire(ctx: GameContext, wi: WeaponInst, px: number, py: number, ax: number, ay: number, playerRadius: number): void {
  const def = wi.def;
  const base = def.damage * (1 + 0.25 * (wi.level - 1));

  if (def.kind === 'beam') {
    fireBeam(ctx, def, base, px, py, ax, ay);
    return;
  }

  if (def.kind === 'chain') {
    fireChain(ctx, def, base, px, py);
    return;
  }

  if (def.kind === 'nova') {
    const r = def.range;
    const neigh: number[] = [];
    ctx.hash.query(px, py, r, neigh);
    for (const o of neigh) {
      const ot = ctx.world.get(o, Transform);
      const oc = ctx.world.get(o, Collider);
      const oh = ctx.world.get(o, Health);
      if (!ot || !oc || !oh) continue;
      const d = Math.hypot(ot.x - px, ot.y - py);
      if (d <= r + oc.r) {
        const { dmg, crit } = rollDmg(ctx, base);
        damageEnemy(ctx, o, dmg, (ot.x - px) / (d || 1), (ot.y - py) / (d || 1), def.knockback, crit);
      }
    }
    ctx.fx.shockwave(px, py, r, '#5fd0ff', 0.26);
    ctx.fx.flash(px, py, r * 0.5, '#eaffff', '#5fd0ff', 0.16);
    ctx.fx.burst(px, py, 20, '#bfe9ff', 280, ctx.rng);
    ctx.audio.nova();
    return;
  }

  const count = def.projectiles + ctx.stats.projectileBonus;
  const baseA = Math.atan2(ay, ax);
  const muzzle = combatMuzzleOffset({ aimX: ax, aimY: ay, radius: playerRadius, recoil: 1, bob: 0 });
  const mx = px + muzzle.x;
  const my = py + muzzle.y;
  for (let i = 0; i < count; i++) {
    const off = count > 1 ? (i / (count - 1) - 0.5) * def.spread : 0;
    const jitter = def.spread > 0 ? (ctx.rng() - 0.5) * 0.05 : 0;
    const a = baseA + off + jitter;
    const { dmg, crit } = rollDmg(ctx, base);
    spawnBullet(ctx, mx, my, Math.cos(a), Math.sin(a), def, dmg, def.pierce + ctx.stats.pierceBonus, crit);
  }
  const flashR = def.id === 'shotgun' || def.id === 'magnum' ? 13 : 8;
  ctx.fx.flash(mx, my, flashR, '#fffaf0', '#ffb43c', 0.07);
  ctx.fx.spark(mx, my, ax, ay, def.id === 'shotgun' ? 5 : 2, '#ffd98a', 240, ctx.rng);
  ctx.audio.shoot();
}
