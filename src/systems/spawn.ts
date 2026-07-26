import type { GameContext } from '../ctx';
import type { EnemyDef } from '../data/schemas';
import { Enemy, Transform } from '../components';
import {
  hordeCapAt, spawnRateMulAt, WAVE,
  activeSurge, SURGE_SPAWN_MUL, eliteChance,
  ENDLESS_BOSS_HP_MUL,
} from '../data/balance';
import { rollEliteAffix } from '../data/elites';
import { ENEMIES, SPAWN_TABLE } from '../data/enemies';
import { spawnEnemyRing, spawnBoss, spawnGoldenRunner } from '../factory';
import { introSpawnMultiplier } from '../runFlow';
import { curseSpawnMul, curseEliteBonus } from './curse';

const GOLDEN_FIRST_AT = 70;
const GOLDEN_INTERVAL = 65;

/**
 * Wave Director: an intensity-aware spawn budget. Budget accrues over time; affordable enemies
 * are rolled from the time-gated table until budget or the alive-cap runs out. The boss arrives
 * at WAVE.bossAt. Crowd cap provides the "breathing" relief valve. Blood-moon surges multiply
 * the budget for a short window; elites roll per-spawn after their unlock time.
 */
export function directorSystem(ctx: GameContext, dt: number): void {
  const d = ctx.director;
  let alive = ctx.world.query(Enemy).length;
  const cap = hordeCapAt(ctx.time.elapsed);
  d.budget += (WAVE.baseRate + ctx.time.elapsed * WAVE.ratePerSec)
    * spawnRateMulAt(ctx.time.elapsed)
    * introSpawnMultiplier(ctx.time.elapsed)
    * (activeSurge(ctx.time.elapsed) ? SURGE_SPAWN_MUL : 1)
    * curseSpawnMul(ctx)
    * dt;

  // Golden runner: a periodic chase target that flees with a coin fountain at stake.
  // Counts toward the horde cap so the cap invariant holds everywhere.
  if (d.nextGoldenAt === undefined) d.nextGoldenAt = GOLDEN_FIRST_AT;
  if (ctx.time.elapsed >= d.nextGoldenAt && alive < cap) {
    d.nextGoldenAt += GOLDEN_INTERVAL;
    spawnGoldenRunner(ctx);
    alive++;
    const pt = ctx.world.get(ctx.player, Transform);
    if (pt) ctx.fx.text(pt.x, pt.y - 44, '黄金逃亡者出现！', '#ffd700', 16);
    ctx.audio.pickup();
  }

  while (d.budget >= 1 && alive < cap) {
    const def = pickEnemy(ctx);
    if (!def) break;
    d.budget -= def.cost;
    const eliteP = Math.min(0.25, eliteChance(ctx.time.elapsed) + curseEliteBonus(ctx));
    const elite = !def.isBoss && def.behavior !== 'exploder' && ctx.rng() < eliteP
      ? rollEliteAffix(ctx.rng)
      : undefined;
    spawnEnemyRing(ctx, def, elite);
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

  // Endless mode: the tyrant keeps coming back, tougher every cycle.
  if (d.endless && d.nextBossAt !== undefined && ctx.time.elapsed >= d.nextBossAt) {
    d.nextBossAt = undefined; // re-armed by killEnemy when this tyrant dies
    d.bossCycle = (d.bossCycle ?? 0) + 1;
    spawnBoss(ctx, ENDLESS_BOSS_HP_MUL ** d.bossCycle);
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
