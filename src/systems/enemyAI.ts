import type { GameContext } from '../ctx';
import { Transform, Velocity, Enemy, Health } from '../components';
import { speedScale, WAVE, activeSurge, SURGE_SPEED_MUL } from '../data/balance';
import { ENEMIES } from '../data/enemies';
import { spawnEnemyBullet, spawnEnemyAt, spawnBossBullet } from '../factory';
import { SLOW_FACTOR, slowActive } from './skills';
import { obstaclesNear, blockedAt, type Obstacle } from '../data/obstacles';
import { startTelegraph } from './telegraph';
import {
  WARDEN_TURN_RATE, BROOD_INTERVAL, BROOD_LITTER,
  LASHER_MIN_RANGE, LASHER_MAX_RANGE, LASHER_INTERVAL, LASHER_WINDUP, LASHER_DAMAGE,
  BOSS_SLAM_WINDUP,
} from '../data/enemies';

/** How close cover has to be before the horde starts steering around it. */
const AVOID_RANGE = 74;

/** Rotate a facing toward (tx, ty) by at most `maxStep` radians. */
function turnToward(en: { faceX: number; faceY: number }, tx: number, ty: number, maxStep: number): void {
  const cur = Math.atan2(en.faceY, en.faceX);
  const want = Math.atan2(ty, tx);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-maxStep, Math.min(maxStep, diff));
  en.faceX = Math.cos(cur + step);
  en.faceY = Math.sin(cur + step);
}

/**
 * Cheap segment test against cover — sampled, not analytic, which is plenty for deciding
 * whether a hook can reach. Ducking behind a container stops the lasher, same as bullets.
 */
function hasLineOfSight(ctx: GameContext, x1: number, y1: number, x2: number, y2: number): boolean {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    if (blockedAt(ctx.seed, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, 4)) return false;
  }
  return true;
}

/**
 * Enemy steering: seek the player + separation (anti-clumping) via the spatial hash.
 * Per-archetype tweaks: spitters kite & fire, the boss periodically summons adds.
 */
export function enemyAISystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform)!;
  const neigh: number[] = [];
  const nearby: Obstacle[] = [];
  const slowMul = slowActive(ctx) ? SLOW_FACTOR : 1;
  const surgeMul = activeSurge(ctx.time.elapsed) ? SURGE_SPEED_MUL : 1;

  for (const e of w.query(Enemy, Transform, Velocity)) {
    const t = w.get(e, Transform)!;
    const v = w.get(e, Velocity)!;
    const en = w.get(e, Enemy)!;
    en.t += dt;

    let dx = pt.x - t.x;
    let dy = pt.y - t.y;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist;
    dy /= dist;

    // separation from nearby enemies
    let sx = 0;
    let sy = 0;
    const sepR = en.def.radius * 2.4;
    ctx.hash.query(t.x, t.y, sepR, neigh);
    for (const o of neigh) {
      if (o === e) continue;
      const ot = w.get(o, Transform);
      if (!ot) continue;
      const ax = t.x - ot.x;
      const ay = t.y - ot.y;
      const d2 = ax * ax + ay * ay;
      if (d2 > 0 && d2 < sepR * sepR) {
        const d = Math.sqrt(d2);
        sx += ax / d;
        sy += ay / d;
      }
    }

    let mx = dx + sx * 0.8;
    let my = dy + sy * 0.8;

    // Tangential avoidance: skim past cover rather than pressing into it. Combined with the
    // push-out in blockerSystem this is enough — see the note there on why there is no A*.
    if (!en.def.isBoss) {
      obstaclesNear(ctx.seed, t.x, t.y, AVOID_RANGE, nearby);
      for (const ob of nearby) {
        const ax = t.x - ob.x;
        const ay = t.y - ob.y;
        const ad = Math.hypot(ax, ay);
        if (ad === 0 || ad > AVOID_RANGE) continue;
        const w8 = (1 - ad / AVOID_RANGE) * 1.6;
        // Slide around whichever way the enemy is already leaning.
        const side = mx * -ay + my * ax >= 0 ? 1 : -1;
        mx += (-ay / ad) * side * w8 + (ax / ad) * w8 * 0.35;
        my += (ax / ad) * side * w8 + (ay / ad) * w8 * 0.35;
      }
    }

    if (en.def.behavior === 'golden') {
      // Flees the player, weaving as it runs; despawns via its Lifetime if it escapes.
      const weave = Math.sin(en.t * 5.2) * 0.55;
      mx = -dx + -dy * weave + sx * 0.4;
      my = -dy + dx * weave + sy * 0.4;
    } else if (en.def.behavior === 'warden') {
      // Shield-first advance: it turns slowly, so a player who circles it gets the back.
      turnToward(en, dx, dy, WARDEN_TURN_RATE * dt);
    } else if (en.def.behavior === 'brood') {
      // Hangs back and floods the field. Ignore it and the horde compounds.
      if (dist < 220) {
        mx = -dx * 0.6 + sx * 0.8;
        my = -dy * 0.6 + sy * 0.8;
      }
      en.abilityCd -= dt * slowMul;
      if (en.abilityCd <= 0 && w.query(Enemy).length < WAVE.cap) {
        en.abilityCd = BROOD_INTERVAL;
        for (let i = 0; i < BROOD_LITTER; i++) {
          const a = ctx.rng() * Math.PI * 2;
          spawnEnemyAt(ctx, ENEMIES['walker']!, t.x + Math.cos(a) * 34, t.y + Math.sin(a) * 34);
        }
        ctx.fx.shockwave(t.x, t.y, 42, '#c79bf0', 0.26);
        ctx.fx.burst(t.x, t.y, 14, '#c79bf0', 150, ctx.rng);
      }
    } else if (en.def.behavior === 'lasher') {
      // Holds a band of range and hooks the player in — standing still at range is no longer safe.
      if (dist < LASHER_MIN_RANGE) {
        mx = -dx + sx * 0.8;
        my = -dy + sy * 0.8;
      } else if (dist > LASHER_MAX_RANGE) {
        mx = dx + sx * 0.8;
        my = dy + sy * 0.8;
      } else {
        mx = sx * 0.8 + -dy * 0.5; // strafe
        my = sy * 0.8 + dx * 0.5;
      }
      en.abilityCd -= dt * slowMul;
      if (
        en.abilityCd <= 0 &&
        dist >= LASHER_MIN_RANGE &&
        dist <= LASHER_MAX_RANGE &&
        hasLineOfSight(ctx, t.x, t.y, pt.x, pt.y)
      ) {
        en.abilityCd = LASHER_INTERVAL;
        startTelegraph(ctx, e, {
          kind: 'lash',
          x: pt.x,
          y: pt.y,
          r: 26,
          windup: LASHER_WINDUP,
          dmg: LASHER_DAMAGE * (en.elite?.dmgMul ?? 1),
          color: '#ffb160',
          cause: '钩刺者拖拽',
        });
      }
    } else if (en.def.behavior === 'spitter') {
      if (dist < 200) {
        mx = -dx + sx * 0.8;
        my = -dy + sy * 0.8;
      }
      en.shootCd -= dt * slowMul;
      if (en.shootCd <= 0 && dist < 460) {
        en.shootCd = 2.4;
        spawnEnemyBullet(ctx, t.x, t.y, dx, dy);
      }
    } else if (en.def.behavior === 'boss') {
      const bh = w.get(e, Health);
      if (bh && !en.enraged && bh.hp / bh.max < 0.5) {
        en.enraged = true;
        ctx.audio.boss();
        ctx.screen.shake = Math.max(ctx.screen.shake, 12);
      }
      en.summonCd -= dt * slowMul;
      if (en.summonCd <= 0 && w.query(Enemy).length < WAVE.cap) {
        en.summonCd = en.enraged ? 2.8 : 4.8;
        const count = en.enraged ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const a = ctx.rng() * Math.PI * 2;
          spawnEnemyAt(ctx, ENEMIES['runner']!, t.x + Math.cos(a) * 60, t.y + Math.sin(a) * 60);
        }
      }
      en.volleyCd -= dt * slowMul;
      if (en.volleyCd <= 0) {
        en.volleyCd = en.enraged ? 1.35 : 2.15;
        const shots = en.enraged ? 12 : 8;
        const speed = en.enraged ? 0.95 : 1;
        for (let i = 0; i < shots; i++) {
          const a = (i / shots) * Math.PI * 2 + en.t * 0.5;
          spawnBossBullet(ctx, t.x, t.y, Math.cos(a) * speed, Math.sin(a) * speed);
        }
        ctx.fx.shockwave(t.x, t.y, 42 + (en.enraged ? 14 : 0), '#e36aa0', 0.22);
        ctx.fx.flash(t.x, t.y, 18, '#ffe7f2', '#e36aa0', 0.12);
        ctx.audio.boss();
      }
      en.slamCd -= dt * slowMul;
      if (en.slamCd <= 0) {
        en.slamCd = en.enraged ? 4.7 : 6.5;
        // Wound up on the ground where the tyrant stands, so the slam is dodgeable now
        // instead of simply happening to whoever was standing near it.
        startTelegraph(ctx, e, {
          kind: 'slam',
          x: t.x,
          y: t.y,
          r: 128 + (en.enraged ? 32 : 0),
          windup: BOSS_SLAM_WINDUP,
          dmg: en.enraged ? 24 : 16,
          color: '#ffb4d0',
          cause: '母巢暴君震地猛击',
        });
        ctx.audio.boss();
      }
    }

    if (en.chillMul < 1 && ctx.time.elapsed >= en.chillUntil) en.chillMul = 1;
    const ml = Math.hypot(mx, my) || 1;
    const speed = en.def.speed
      * speedScale(ctx.time.elapsed)
      * (en.enraged ? 1.4 : 1)
      * (en.elite?.speedMul ?? 1)
      * surgeMul
      * slowMul
      * en.chillMul;
    v.x = (mx / ml) * speed;
    v.y = (my / ml) * speed;
  }
}
