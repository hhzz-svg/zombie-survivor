import type { GameContext } from '../ctx';
import { Transform, Velocity, Health, Enemy, Survivor, Wingman, Collider } from '../components';
import {
  MAX_SQUAD, RESCUE_RADIUS, SURVIVOR_FIRST_AT, SURVIVOR_INTERVAL,
  rollWingman, wingmanDamage,
} from '../data/wingmen';
import { WEAPONS } from '../data/weapons';
import { spawnSurvivor, spawnWingman, spawnBullet } from '../factory';

/**
 * Squad lifecycle: stranded survivors appear while there is room, joining on
 * proximity; wingmen orbit assigned slots around the player, engage on their
 * own cooldowns, take contact damage from the horde, and can fall for good.
 */

const SLOT_BASE = [Math.PI * 0.75, Math.PI * 1.25]; // behind-left / behind-right
const SLOT_DIST = 48;
const FOLLOW_GAIN = 4.2;
const MAX_FOLLOW_SPEED = 300;
const CONTACT_INVULN = 0.7;

export function squadSize(ctx: GameContext): number {
  return ctx.world.query(Wingman).length;
}

function freeSlot(ctx: GameContext): number {
  const used = new Set(
    ctx.world.query(Wingman).map((e) => ctx.world.get(e, Wingman)!.slot),
  );
  for (let s = 0; s < MAX_SQUAD; s++) if (!used.has(s)) return s;
  return 0;
}

export function wingmanSystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform);
  if (!pt) return;

  // --- stranded survivors: spawn on cadence while there is squad room
  const d = ctx.director;
  if (d.nextSurvivorAt === undefined) d.nextSurvivorAt = SURVIVOR_FIRST_AT;
  if (ctx.time.elapsed >= d.nextSurvivorAt) {
    d.nextSurvivorAt += SURVIVOR_INTERVAL;
    if (squadSize(ctx) + w.query(Survivor).length < MAX_SQUAD) {
      const def = rollWingman(ctx.rng);
      const e = spawnSurvivor(ctx, def);
      const st = w.get(e, Transform)!;
      ctx.fx.shockwave(st.x, st.y, 52, '#eafff7', 0.5);
      ctx.fx.text(st.x, st.y - 26, `发现幸存者：${def.name}`, '#eafff7', 15);
      ctx.audio.pickup();
    }
  }

  // --- waiting survivors: rescue by proximity, or they give up and slip away
  for (const e of w.query(Survivor, Transform)) {
    const sv = w.get(e, Survivor)!;
    const t = w.get(e, Transform)!;
    if (ctx.time.elapsed >= sv.until) {
      ctx.fx.text(t.x, t.y - 20, '幸存者离开了…', '#9ab1aa', 13);
      w.destroy(e);
      continue;
    }
    const d2 = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2;
    if (d2 <= RESCUE_RADIUS * RESCUE_RADIUS && squadSize(ctx) < MAX_SQUAD) {
      w.destroy(e);
      spawnWingman(ctx, sv.def, t.x, t.y, freeSlot(ctx));
      ctx.run.rescued++;
      ctx.fx.shockwave(t.x, t.y, 70, sv.def.color, 0.4);
      ctx.fx.burst(t.x, t.y, 16, sv.def.color, 220, ctx.rng);
      ctx.fx.text(t.x, t.y - 26, `${sv.def.name}加入编队！`, sv.def.color, 16);
      ctx.audio.levelUp();
      ctx.vfx?.onAnnounce?.(
        `${sv.def.name}已入队`,
        sv.def.id === 'medic' ? '定期为你治疗' : sv.def.id === 'gunner' ? '远程速射火力支援' : '近距火焰洗地',
        'achieve',
      );
    }
  }

  // --- squadmates: follow, fight, and bleed
  const slow = 1; // wingmen ignore time-slow (player skill should not nerf allies)
  for (const e of w.query(Wingman, Transform, Velocity)) {
    const wm = w.get(e, Wingman)!;
    const t = w.get(e, Transform)!;
    const v = w.get(e, Velocity)!;
    const h = w.get(e, Health)!;
    if (wm.invuln > 0) wm.invuln -= dt;
    if (h.flash > 0) h.flash -= dt;

    // follow the assigned slot, drifting gently around the player
    const ang = SLOT_BASE[wm.slot % SLOT_BASE.length]! + Math.sin(ctx.time.elapsed * 0.6 + wm.slot * 2.1) * 0.22;
    const tx = pt.x + Math.cos(ang) * SLOT_DIST;
    const ty = pt.y + Math.sin(ang) * SLOT_DIST;
    v.x = Math.max(-MAX_FOLLOW_SPEED, Math.min(MAX_FOLLOW_SPEED, (tx - t.x) * FOLLOW_GAIN));
    v.y = Math.max(-MAX_FOLLOW_SPEED, Math.min(MAX_FOLLOW_SPEED, (ty - t.y) * FOLLOW_GAIN));

    // contact damage from the horde (halved — they are support, not tanks)
    if (wm.invuln <= 0) {
      const neigh: number[] = [];
      ctx.hash.query(t.x, t.y, 30, neigh);
      for (const o of neigh) {
        const en = w.get(o, Enemy);
        const ot = w.get(o, Transform);
        const oc = w.get(o, Collider);
        if (!en || !ot || !oc || en.def.contactDmg <= 0) continue;
        const rr = 10 + oc.r;
        if ((ot.x - t.x) ** 2 + (ot.y - t.y) ** 2 <= rr * rr) {
          wm.invuln = CONTACT_INVULN;
          h.hp -= en.def.contactDmg * 0.5 * (en.elite?.dmgMul ?? 1);
          h.flash = 0.15;
          ctx.fx.spark(t.x, t.y, t.x - ot.x, t.y - ot.y, 4, wm.def.color, 160, ctx.rng);
          break;
        }
      }
    }
    if (h.hp <= 0) {
      ctx.fx.burst(t.x, t.y, 20, wm.def.color, 240, ctx.rng);
      ctx.fx.text(t.x, t.y - 22, `${wm.def.name}倒下了`, '#ff5a6a', 15);
      ctx.audio.hurt();
      ctx.vfx?.onAnnounce?.(`${wm.def.name}阵亡`, '继续前进，会有新的幸存者出现', 'curse');
      w.destroy(e);
      continue;
    }

    // act on cooldown
    wm.cd -= dt * slow;
    if (wm.cd > 0) continue;
    wm.cd += wm.def.cooldown;

    if (wm.def.id === 'medic') {
      const ph = w.get(ctx.player, Health);
      if (ph && ph.hp < ph.max && ph.hp > 0) {
        ph.hp = Math.min(ph.max, ph.hp + (wm.def.heal ?? 3));
        ctx.fx.streak(t.x, t.y, pt.x, pt.y, wm.def.color);
        ctx.fx.text(pt.x, pt.y - 24, `+${wm.def.heal ?? 3}`, wm.def.color, 12);
      }
      continue;
    }

    // gunner / burner: engage the nearest enemy in range
    const neigh: number[] = [];
    ctx.hash.query(t.x, t.y, wm.def.range, neigh);
    let bestD = Infinity;
    let bx = 0;
    let by = 0;
    for (const o of neigh) {
      const ot = w.get(o, Transform);
      const oh = w.get(o, Health);
      if (!ot || !oh || oh.hp <= 0) continue;
      const dd = (ot.x - t.x) ** 2 + (ot.y - t.y) ** 2;
      if (dd < bestD && dd <= wm.def.range * wm.def.range) {
        bestD = dd;
        bx = ot.x - t.x;
        by = ot.y - t.y;
      }
    }
    if (bestD === Infinity) continue;
    const len = Math.sqrt(bestD) || 1;
    const dmg = wingmanDamage(wm.def, ctx.time.elapsed);
    if (wm.def.id === 'gunner') {
      const jitter = (ctx.rng() - 0.5) * 0.08;
      const a = Math.atan2(by / len, bx / len) + jitter;
      spawnBullet(ctx, t.x, t.y, Math.cos(a), Math.sin(a), WEAPONS['smg']!, dmg, 0);
      ctx.fx.flash(t.x, t.y, 6, '#fffaf0', wm.def.color, 0.06);
    } else {
      const base = Math.atan2(by / len, bx / len);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.16 + (ctx.rng() - 0.5) * 0.06;
        spawnBullet(ctx, t.x, t.y, Math.cos(a), Math.sin(a), WEAPONS['flamer']!, dmg, 1);
      }
      ctx.fx.flash(t.x, t.y, 7, '#fff3b0', '#ff6b1a', 0.07);
    }
  }
}
