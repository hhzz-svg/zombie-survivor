import type { GameContext } from '../ctx';
import { Aim, Health, Transform } from '../components';
import { skillById } from '../data/skills';
import { damageEnemy } from './combat';

const DASH_DISTANCE = 160;
const DASH_INVULN = 0.25;
const BURST_RADIUS = 190;
const BURST_DAMAGE = 95;
const BARRIER_DURATION = 10;
const BARRIER_LAYERS = 3;
const SLOW_DURATION = 6;
export const SLOW_FACTOR = 0.65;

export function buySkill(ctx: GameContext, id: string): boolean {
  const skill = skillById(id);
  if (!skill || ctx.skills.owned.has(id) || ctx.equip.gold < skill.cost) return false;
  ctx.equip.gold -= skill.cost;
  ctx.skills.owned.add(id);
  ctx.skills.cooldowns.set(id, 0);
  return true;
}

export function useSkill(ctx: GameContext, keyCode: string): boolean {
  const skill = ['dash', 'burst', 'barrier', 'slow']
    .map((id) => skillById(id))
    .find((def) => def?.key === keyCode);
  if (!skill || !ctx.skills.owned.has(skill.id) || skillCooldownRemaining(ctx, skill.id) > 0) return false;

  let used = false;
  switch (skill.id) {
    case 'dash':
      used = activateDash(ctx);
      break;
    case 'burst':
      used = activateBurst(ctx);
      break;
    case 'barrier':
      used = activateBarrier(ctx);
      break;
    case 'slow':
      used = activateSlow(ctx);
      break;
  }
  if (!used) return false;

  ctx.skills.cooldowns.set(skill.id, ctx.time.elapsed + skill.cooldown);
  return true;
}

export function skillSystem(ctx: GameContext, _dt: number): void {
  if (ctx.skills.barrierUntil > 0 && ctx.time.elapsed >= ctx.skills.barrierUntil) {
    ctx.skills.barrierUntil = 0;
    ctx.skills.barrierLayers = 0;
  }
  if (ctx.skills.slowUntil > 0 && ctx.time.elapsed >= ctx.skills.slowUntil) {
    ctx.skills.slowUntil = 0;
  }
  if (ctx.skills.dashUntil > 0 && ctx.time.elapsed >= ctx.skills.dashUntil) {
    ctx.skills.dashUntil = 0;
  }
}

export function skillCooldownRemaining(ctx: GameContext, id: string): number {
  return Math.max(0, (ctx.skills.cooldowns.get(id) ?? 0) - ctx.time.elapsed);
}

export function slowActive(ctx: GameContext): boolean {
  return ctx.skills.slowUntil > ctx.time.elapsed;
}

export function barrierAbsorb(ctx: GameContext): boolean {
  if (ctx.skills.barrierUntil <= ctx.time.elapsed || ctx.skills.barrierLayers <= 0) return false;
  ctx.skills.barrierLayers--;
  if (ctx.skills.barrierLayers <= 0) ctx.skills.barrierUntil = 0;
  const pt = ctx.world.get(ctx.player, Transform);
  if (pt) {
    ctx.fx.burst(pt.x, pt.y, 12, '#74c7ff', 170, ctx.rng);
    ctx.fx.flash(pt.x, pt.y, 28, '#ffffff', '#66baff', 0.16);
  }
  ctx.audio.pickup();
  return true;
}

function activateDash(ctx: GameContext): boolean {
  const pt = ctx.world.get(ctx.player, Transform);
  const aim = ctx.world.get(ctx.player, Aim);
  const hp = ctx.world.get(ctx.player, Health);
  if (!pt || !aim || !hp) return false;

  const x0 = pt.x;
  const y0 = pt.y;
  pt.x += aim.x * DASH_DISTANCE;
  pt.y += aim.y * DASH_DISTANCE;
  hp.invuln = Math.max(hp.invuln, DASH_INVULN);
  ctx.skills.dashUntil = ctx.time.elapsed + DASH_INVULN;
  ctx.fx.spark(x0, y0, -aim.x, -aim.y, 12, '#6ee7ff', 160, ctx.rng);
  ctx.fx.flash(pt.x, pt.y, 18, '#eaffff', '#54d6ff', 0.12);
  ctx.screen.shake = Math.max(ctx.screen.shake, 5);
  ctx.audio.pickup();
  return true;
}

function activateBurst(ctx: GameContext): boolean {
  const pt = ctx.world.get(ctx.player, Transform);
  if (!pt) return false;

  const neigh: number[] = [];
  ctx.hash.query(pt.x, pt.y, BURST_RADIUS, neigh);
  for (const o of neigh) {
    const ot = ctx.world.get(o, Transform);
    const oh = ctx.world.get(o, Health);
    if (!ot || !oh) continue;
    const d = Math.hypot(ot.x - pt.x, ot.y - pt.y);
    if (d <= BURST_RADIUS) {
      damageEnemy(ctx, o, BURST_DAMAGE * ctx.stats.damageMul, (ot.x - pt.x) / (d || 1), (ot.y - pt.y) / (d || 1), 180);
    }
  }
  ctx.fx.shockwave(pt.x, pt.y, BURST_RADIUS, '#ff8f4f', 0.3);
  ctx.fx.burst(pt.x, pt.y, 28, '#ffb066', 240, ctx.rng);
  ctx.screen.shake = Math.max(ctx.screen.shake, 10);
  ctx.audio.explode();
  return true;
}

function activateBarrier(ctx: GameContext): boolean {
  const pt = ctx.world.get(ctx.player, Transform);
  ctx.skills.barrierUntil = ctx.time.elapsed + BARRIER_DURATION;
  ctx.skills.barrierLayers = BARRIER_LAYERS;
  if (pt) {
    ctx.fx.shockwave(pt.x, pt.y, 58, '#70c8ff', 0.26);
    ctx.fx.flash(pt.x, pt.y, 32, '#ffffff', '#4fa9ff', 0.18);
  }
  ctx.audio.levelUp();
  return true;
}

function activateSlow(ctx: GameContext): boolean {
  const pt = ctx.world.get(ctx.player, Transform);
  ctx.skills.slowUntil = ctx.time.elapsed + SLOW_DURATION;
  if (pt) {
    ctx.fx.shockwave(pt.x, pt.y, 210, '#a890ff', 0.45);
    ctx.fx.burst(pt.x, pt.y, 18, '#b7a5ff', 220, ctx.rng);
  }
  ctx.audio.boss();
  return true;
}
