import type { InputProvider } from '../input/provider';
import type { GameContext } from '../ctx';
import { Transform, Enemy, XPGem, GoldCoin, Health, Telegraph, Barrel } from '../components';
import { blockedAt, BARREL_RADIUS } from '../data/obstacles';

/**
 * Scripted "player" for the headless sim.
 *
 * The old bot ran directly away from the single nearest zombie, which walked it straight into
 * the other three and left it dying around the 37-second mark — far too early to say anything
 * about weapons, evolutions or the boss. This one uses context steering: score a ring of
 * candidate headings against a threat field, cover, pending telegraphs and loot, then commit
 * to the best. It is still not a good player, but it survives long enough that the numbers it
 * produces describe the actual game instead of the first 90 seconds of it.
 *
 * Deterministic by construction: no Math.random, no wall clock — same seed, same run.
 */

/**
 * Steering weights. These are the yardstick's own calibration, so they are exposed and
 * measured with `npm run balance` rather than guessed — an early guess at `momentum` made
 * every local decision look sensible while cutting the bot's win rate from 27% to 5%.
 */
export interface BotTuning {
  /** How strongly the bot keeps its current heading. Commitment beats local optimality here. */
  momentum: number;
  /** Pull toward nearby gems and coins, applied only while not under pressure. */
  loot: number;
  /** Softening term in the inverse-square threat falloff; larger = flatter near field. */
  soften: number;
}

export const DEFAULT_BOT: BotTuning = { momentum: 2.5, loot: 6, soften: 900 };

const DIRECTIONS = 16;
const PROBE = 52; // how far ahead a candidate heading is evaluated
const THREAT_RADIUS = 230;
const MAX_THREATS = 48;
const LOOT_RADIUS = 300;

interface Threat {
  x: number;
  y: number;
  weight: number;
}

export class AiInput implements InputProvider {
  ctx!: GameContext;
  tuning: BotTuning = { ...DEFAULT_BOT };
  private readonly scratch: number[] = [];
  private readonly threats: Threat[] = [];
  private lastDirX = 1;
  private lastDirY = 0;
  private frame = -1;

  /** Collect the local threat field once per step; 16 headings then score against it in memory. */
  private gatherThreats(px: number, py: number): void {
    this.threats.length = 0;
    this.ctx.hash.query(px, py, THREAT_RADIUS, this.scratch);
    for (const e of this.scratch) {
      const en = this.ctx.world.get(e, Enemy);
      const t = this.ctx.world.get(e, Transform);
      if (!en || !t) continue; // barrels share the hash and are not a threat
      // Hitting harder or moving faster makes an enemy worth more space.
      const weight = (1 + en.def.contactDmg / 12) * (en.def.isBoss ? 6 : 1) * (en.elite ? 1.8 : 1);
      this.threats.push({ x: t.x, y: t.y, weight });
      if (this.threats.length >= MAX_THREATS) break;
    }
  }

  /** Summed inverse-square pressure at a point — the thing the bot is trying to minimise. */
  private danger(x: number, y: number): number {
    let sum = 0;
    for (const t of this.threats) {
      const d2 = (t.x - x) ** 2 + (t.y - y) ** 2;
      // Softening keeps a point-blank enemy from dominating every heading at once.
      sum += t.weight / (d2 + this.tuning.soften);
    }
    // Standing in a telegraphed attack is the other way to die.
    for (const e of this.ctx.world.query(Telegraph)) {
      const tg = this.ctx.world.get(e, Telegraph)!;
      const d = Math.hypot(tg.x - x, tg.y - y);
      if (d <= tg.r + 20) sum += 0.35;
    }
    // A lit barrel, likewise. Without this the bot cannot see the thing that kills it most
    // often — and a yardstick that is blind to a hazard cannot measure a change to it.
    for (const e of this.ctx.world.query(Barrel, Transform)) {
      if (this.ctx.world.get(e, Barrel)!.fuse <= 0) continue;
      const t = this.ctx.world.get(e, Transform)!;
      if (Math.hypot(t.x - x, t.y - y) <= BARREL_RADIUS + 24) sum += 0.5;
    }
    return sum;
  }

  /** Unit vector toward nearby loot, or zero. Gems are not in the spatial hash, so scan them. */
  private lootPull(px: number, py: number): { x: number; y: number } {
    let lx = 0;
    let ly = 0;
    const w = this.ctx.world;
    for (const store of [XPGem, GoldCoin] as const) {
      for (const e of w.query(store, Transform)) {
        const t = w.get(e, Transform)!;
        const dx = t.x - px;
        const dy = t.y - py;
        const d = Math.hypot(dx, dy);
        if (d > LOOT_RADIUS || d < 1) continue;
        lx += dx / d / d;
        ly += dy / d / d;
      }
    }
    const l = Math.hypot(lx, ly);
    return l > 0 ? { x: lx / l, y: ly / l } : { x: 0, y: 0 };
  }

  axis(): { x: number; y: number } {
    const p = this.ctx.world.get(this.ctx.player, Transform)!;
    this.frame++;
    this.gatherThreats(p.x, p.y);
    const loot = this.lootPull(p.x, p.y);
    const crowded = this.danger(p.x, p.y) > 0.002; // under real pressure, loot stops mattering

    let bestX = this.lastDirX;
    let bestY = this.lastDirY;
    let bestScore = -Infinity;
    for (let i = 0; i < DIRECTIONS; i++) {
      const a = (i / DIRECTIONS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const tx = p.x + dx * PROBE;
      const ty = p.y + dy * PROBE;

      // Danger lands roughly in 0.4 (a walker 100px off) to 4 (one in your face) here, so the
      // other terms are sized well under that: they must shade a choice, never overrule a threat.
      let score = -this.danger(tx, ty) * 1000;
      // Never steer into cover: the push-out would eat the movement anyway.
      if (blockedAt(this.ctx.seed, tx, ty, 16)) score -= 40;
      if (!crowded) score += (dx * loot.x + dy * loot.y) * this.tuning.loot;
      // Commitment. Measured, not guessed: dropping this to a tiebreaker made every single
      // decision locally safer and the run far shorter, because a survivor bot that
      // re-evaluates every frame dithers itself into the middle of the horde.
      score += (dx * this.lastDirX + dy * this.lastDirY) * this.tuning.momentum;

      if (score > bestScore) {
        bestScore = score;
        bestX = dx;
        bestY = dy;
      }
    }

    this.lastDirX = bestX;
    this.lastDirY = bestY;
    return { x: bestX, y: bestY };
  }

  /** Shoot what matters: the boss, then elites, then whatever is closest and alive. */
  aim(px: number, py: number): { x: number; y: number } {
    const w = this.ctx.world;
    this.ctx.hash.query(px, py, 520, this.scratch);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (const e of this.scratch) {
      const en = w.get(e, Enemy);
      const t = w.get(e, Transform);
      const h = w.get(e, Health);
      if (!en || !t || !h || h.hp <= 0) continue;
      const d = Math.hypot(t.x - px, t.y - py) || 1;
      const priority = en.def.isBoss ? 60 : en.elite ? 8 : 1;
      const score = priority / d;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) return { x: this.lastDirX, y: this.lastDirY };
    const dx = best.x - px;
    const dy = best.y - py;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
}
