import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { COMBO_WINDOW } from '../src/data/balance';
import { addComboKill, comboSystem, comboTier, comboXpMul, comboGoldMul, resetCombo } from '../src/systems/combo';
import { damagePlayer } from '../src/systems/combat';
import { Health } from '../src/components';

describe('kill combo', () => {
  it('climbs tiers with kill count', () => {
    expect(comboTier(0).xpMul).toBe(1);
    expect(comboTier(9).xpMul).toBe(1);
    expect(comboTier(10).name).toBe('连击');
    expect(comboTier(25).xpMul).toBeCloseTo(1.25);
    expect(comboTier(50).xpMul).toBeCloseTo(1.5);
    expect(comboTier(100).xpMul).toBe(2);
    expect(comboTier(400).xpMul).toBe(2); // top tier is a plateau
  });

  it('counts kills, tracks the best chain, and extends the window', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = 10;
    addComboKill(ctx, 12);
    expect(ctx.run.combo.count).toBe(12);
    expect(ctx.run.combo.best).toBe(12);
    expect(ctx.run.combo.until).toBeCloseTo(10 + COMBO_WINDOW);
    expect(comboXpMul(ctx)).toBeCloseTo(1.1);
  });

  it('decays to zero when the window closes without a kill', () => {
    const ctx = makeCtx();
    addComboKill(ctx, 30);
    ctx.time.elapsed = COMBO_WINDOW + 0.01;
    comboSystem(ctx, 1 / 60);
    expect(ctx.run.combo.count).toBe(0);
    expect(ctx.run.combo.best).toBe(30); // best survives the decay
    expect(comboXpMul(ctx)).toBe(1);
    expect(comboGoldMul(ctx)).toBe(1);
  });

  it('breaks on real HP damage but not on a shielded hit', () => {
    const ctx = makeCtx();
    addComboKill(ctx, 40);
    ctx.equip.shield = 1;
    damagePlayer(ctx, 10);
    expect(ctx.run.combo.count).toBe(40); // shield ate the hit — chain lives

    damagePlayer(ctx, 10);
    expect(ctx.world.get(ctx.player, Health)!.hp).toBeLessThan(ctx.stats.maxHp);
    expect(ctx.run.combo.count).toBe(0); // real damage broke it
  });

  it('resetCombo keeps the best-chain record', () => {
    const ctx = makeCtx();
    addComboKill(ctx, 77);
    resetCombo(ctx);
    expect(ctx.run.combo.count).toBe(0);
    expect(ctx.run.combo.best).toBe(77);
  });
});
