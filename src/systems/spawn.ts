import type { GameContext } from '../ctx';
import type { EnemyDef } from '../data/schemas';
import { Enemy, Transform } from '../components';
import { hordeCapAt, spawnRateMulAt, WAVE } from '../data/balance';
import { ENEMIES, SPAWN_TABLE } from '../data/enemies';
import { spawnEnemyRing, spawnBoss } from '../factory';
import { introSpawnMultiplier } from '../runFlow';

/**
 * Wave Director: an intensity-aware spawn budget. Budget accrues over time; affordable enemies
 * are rolled from the time-gated table until budget or the alive-cap runs out. The boss arrives
 * at WAVE.bossAt. Crowd cap provides the "breathing" relief valve.
 */
export function directorSystem(ctx: GameContext, dt: number): void {
  const d = ctx.director;
  let alive = ctx.world.query(Enemy).length;
  const cap = hordeCapAt(ctx.time.elapsed);
  d.budget += (WAVE.baseRate + ctx.time.elapsed * WAVE.ratePerSec)
    * spawnRateMulAt(ctx.time.elapsed)
    * introSpawnMultiplier(ctx.time.elapsed)
    * dt;

  while (d.budget >= 1 && alive < cap) {
    const def = pickEnemy(ctx);
    if (!def) break;
    d.budget -= def.cost;
    spawnEnemyRing(ctx, def);
    alive++;
  }

  const bossLeadIn = 15;
  if (!d.bossSpawned && d.bossWarningAt === undefined && ctx.time.elapsed >= WAVE.bossAt - bossLeadIn) {
    d.bossWarningAt = ctx.time.elapsed;
    const pt = ctx.world.get(ctx.player, Transform);
    const x = pt?.x ?? 0;
    const y = pt?.y ?? 0;
    ctx.fx.shockwave(x, y, 180, '#ffb4d0', 0.5);
    ctx.fx.flash(x, y, 24, '#ffe7f2', '#ff87b5', 0.16);
    ctx.screen.shake = Math.max(ctx.screen.shake, 7);
    ctx.audio.boss();
  }

  if (!d.bossSpawned && ctx.time.elapsed >= WAVE.bossAt) {
    d.bossSpawned = true;
    d.bossWarningAt = undefined;
    spawnBoss(ctx);
  }
}

function pickEnemy(ctx: GameContext): EnemyDef | null {
  const t = ctx.time.elapsed;
  const eligible = SPAWN_TABLE.filter((s) => t >= s.from && ENEMIES[s.id]!.cost <= ctx.director.budget);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((a, s) => a + s.weight, 0);
  let r = ctx.rng() * total;
  for (const s of eligible) {
    r -= s.weight;
    if (r <= 0) return ENEMIES[s.id]!;
  }
  return ENEMIES[eligible[eligible.length - 1]!.id]!;
}
