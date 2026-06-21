import type { GameContext } from '../ctx';
import { Transform, Velocity, Enemy, Health } from '../components';
import { speedScale, WAVE } from '../data/balance';
import { ENEMIES } from '../data/enemies';
import { spawnEnemyBullet, spawnEnemyAt } from '../factory';

/**
 * Enemy steering: seek the player + separation (anti-clumping) via the spatial hash.
 * Per-archetype tweaks: spitters kite & fire, the boss periodically summons adds.
 */
export function enemyAISystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  const pt = w.get(ctx.player, Transform)!;
  const neigh: number[] = [];

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
      en.shootCd -= dt;
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
      en.summonCd -= dt;
      if (en.summonCd <= 0 && w.query(Enemy).length < WAVE.cap) {
        en.summonCd = en.enraged ? 3 : 5;
        const count = en.enraged ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const a = ctx.rng() * Math.PI * 2;
          spawnEnemyAt(ctx, ENEMIES['runner']!, t.x + Math.cos(a) * 60, t.y + Math.sin(a) * 60);
        }
      }
    }

    const ml = Math.hypot(mx, my) || 1;
    const speed = en.def.speed * speedScale(ctx.time.elapsed) * (en.enraged ? 1.4 : 1);
    v.x = (mx / ml) * speed;
    v.y = (my / ml) * speed;
  }
}
