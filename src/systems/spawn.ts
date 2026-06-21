import type { GameContext } from '../ctx';
import type { EnemyDef } from '../data/schemas';
import { Enemy } from '../components';
import { WAVE } from '../data/balance';
import { ENEMIES, SPAWN_TABLE } from '../data/enemies';
import { spawnEnemyRing, spawnBoss } from '../factory';

/**
 * Wave Director: an intensity-aware spawn budget. Budget accrues over time; affordable enemies
 * are rolled from the time-gated table until budget or the alive-cap runs out. The boss arrives
 * at WAVE.bossAt. Crowd cap provides the "breathing" relief valve.
 */
export function directorSystem(ctx: GameContext, dt: number): void {
  const d = ctx.director;
  let alive = ctx.world.query(Enemy).length;
  d.budget += (WAVE.baseRate + ctx.time.elapsed * WAVE.ratePerSec) * dt;

  while (d.budget >= 1 && alive < WAVE.cap) {
    const def = pickEnemy(ctx);
    if (!def) break;
    d.budget -= def.cost;
    spawnEnemyRing(ctx, def);
    alive++;
  }

  if (!d.bossSpawned && ctx.time.elapsed >= WAVE.bossAt) {
    d.bossSpawned = true;
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
