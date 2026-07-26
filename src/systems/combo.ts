import type { GameContext, RunState } from '../ctx';
import { Transform } from '../components';
import { COMBO_TIERS, COMBO_WINDOW, type ComboTier } from '../data/balance';

/**
 * Kill combo: every kill extends a short chain window. Chain length climbs
 * tiers that multiply XP (at collect time) and gold (at drop time). Taking
 * real HP damage breaks the chain — shields and barriers keep it alive,
 * which quietly rewards defensive builds.
 */

export function freshRunState(): RunState {
  return {
    combo: { count: 0, best: 0, until: 0 },
    elitesKilled: 0,
    cratesOpened: 0,
    tyrantsSlain: 0,
    goldenKilled: 0,
    evolved: false,
    firstHpHitAt: null,
    adrenalineUsed: false,
    curse: 0,
    rescued: 0,
  };
}

/** Kill-sound pitch ladder: rises with the live chain, capped for sanity. */
export function comboPitch(ctx: GameContext): number {
  return 1 + Math.min(0.6, ctx.run.combo.count * 0.006);
}

/** Highest tier reached at `count` kills. */
export function comboTier(count: number): ComboTier {
  let tier = COMBO_TIERS[0]!;
  for (const t of COMBO_TIERS) {
    if (count >= t.at) tier = t;
    else break;
  }
  return tier;
}

export function addComboKill(ctx: GameContext, kills = 1): void {
  const c = ctx.run.combo;
  const prev = comboTier(c.count);
  c.count += kills;
  c.best = Math.max(c.best, c.count);
  c.until = ctx.time.elapsed + COMBO_WINDOW;
  const tier = comboTier(c.count);
  if (tier !== prev && tier.at > 0) {
    const pt = ctx.world.get(ctx.player, Transform);
    if (pt) {
      ctx.fx.shockwave(pt.x, pt.y, 70 + tier.at * 0.6, tier.color, 0.32);
      ctx.fx.text(pt.x, pt.y - 34, `${tier.name}！ x${c.count}`, tier.color, 19);
    }
    ctx.audio.levelUp();
  }
}

export function resetCombo(ctx: GameContext): void {
  const c = ctx.run.combo;
  if (c.count === 0) return;
  c.count = 0;
  c.until = 0;
}

/** Chain decays when the window closes without a kill. */
export function comboSystem(ctx: GameContext, _dt: number): void {
  const c = ctx.run.combo;
  if (c.count > 0 && ctx.time.elapsed >= c.until) resetCombo(ctx);
}

export function comboXpMul(ctx: GameContext): number {
  return comboTier(ctx.run.combo.count).xpMul;
}

export function comboGoldMul(ctx: GameContext): number {
  return comboTier(ctx.run.combo.count).goldMul;
}
