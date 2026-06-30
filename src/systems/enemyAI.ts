import type { GameContext } from '../ctx';
import { Transform, Velocity, Enemy, Health } from '../components';
import { speedScale, WAVE } from '../data/balance';
import { ENEMIES } from '../data/enemies';
import { spawnEnemyBullet, spawnEnemyAt, spawnBossBullet } from '../factory';
import { damagePlayer } from './combat';
import { SLOW_FACTOR, slowActive } from './skills';

/**
 * Enemy steering: seek the player + separation (anti-clumping) via the spatial hash.
 * Per-archetype tweaks: spitters kite & fire, the boss periodically summons adds.
 */
export function enemyAISystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform)!;
  const neigh: number[] = [];
  const slowMul = slowActive(ctx) ? SLOW_FACTOR : 1;

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

    if (en.def.behavior === 'spitter') {
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
        const radius = 128 + (en.enraged ? 32 : 0);
        ctx.fx.shockwave(t.x, t.y, radius, '#ffb4d0', 0.38);
        ctx.fx.burst(t.x, t.y, en.enraged ? 28 : 20, '#ff87b5', 220, ctx.rng);
        const ptDist = Math.hypot(pt.x - t.x, pt.y - t.y) || 1;
        const push = en.enraged ? 260 : 180;
        const px = (pt.x - t.x) / ptDist;
        const py = (pt.y - t.y) / ptDist;
        if (ptDist <= radius + 14) damagePlayer(ctx, en.enraged ? 24 : 16, '母巢暴君震地猛击');
        pt.x += px * push * 0.02;
        pt.y += py * push * 0.02;
        ctx.time.hitStop = Math.max(ctx.time.hitStop, en.enraged ? 45 : 28);
        ctx.screen.shake = Math.max(ctx.screen.shake, en.enraged ? 18 : 12);
        ctx.audio.explode();
      }
    }

    const ml = Math.hypot(mx, my) || 1;
    const speed = en.def.speed * speedScale(ctx.time.elapsed) * (en.enraged ? 1.4 : 1) * slowMul;
    v.x = (mx / ml) * speed;
    v.y = (my / ml) * speed;
  }
}
