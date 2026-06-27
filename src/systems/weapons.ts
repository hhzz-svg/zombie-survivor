import type { GameContext } from '../ctx';
import type { WeaponInst } from '../components';
import { Transform, Aim, Loadout, Health, Collider } from '../components';
import { spawnBullet } from '../factory';
import { damageEnemy } from './combat';

export const MUZZLE_DISTANCE = 22;

/** Fires each owned weapon on its cooldown toward the aim vector (manual aim + auto fire). */
export function weaponSystem(ctx: GameContext, dt: number): void {
  const pt = ctx.world.get(ctx.player, Transform)!;
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
    fire(ctx, wi, pt.x, pt.y, aim.x, aim.y);
  }
}

/** base × damageMul, doubled on a crit roll. Returns the rolled amount and whether it crit. */
function rollDmg(ctx: GameContext, base: number): { dmg: number; crit: boolean } {
  const crit = ctx.rng() < ctx.stats.crit;
  return { dmg: base * ctx.stats.damageMul * (crit ? 2 : 1), crit };
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

function fire(ctx: GameContext, wi: WeaponInst, px: number, py: number, ax: number, ay: number): void {
  const def = wi.def;
  const base = def.damage * (1 + 0.25 * (wi.level - 1));

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
  const mx = px + ax * MUZZLE_DISTANCE;
  const my = py + ay * MUZZLE_DISTANCE;
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
