import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { damagePlayer } from '../src/systems/combat';
import { Health } from '../src/components';

describe('adrenaline surge', () => {
  it('fires once when hp first dips under 20%, healing and granting i-frames', () => {
    const ctx = makeCtx();
    const h = ctx.world.get(ctx.player, Health)!;
    h.hp = 30; // 30% of 100

    damagePlayer(ctx, 15); // → 15, under the 20% line
    expect(ctx.run.adrenalineUsed).toBe(true);
    expect(h.hp).toBe(30); // 15 after damage + 15 surge heal
    expect(h.invuln).toBeGreaterThanOrEqual(1.5);
    expect(ctx.run.firstHpHitAt).toBe(0);
  });

  it('never fires twice in the same run', () => {
    const ctx = makeCtx();
    const h = ctx.world.get(ctx.player, Health)!;
    h.hp = 30;
    damagePlayer(ctx, 15);
    expect(ctx.run.adrenalineUsed).toBe(true);
    const after = h.hp;

    h.invuln = 0; // clear i-frames so the next hit lands
    damagePlayer(ctx, 12);
    expect(h.hp).toBe(after - 12); // no second surge heal
  });

  it('does not fire on a lethal hit', () => {
    const ctx = makeCtx();
    let died = false;
    ctx.events.onDeath = () => {
      died = true;
    };
    const h = ctx.world.get(ctx.player, Health)!;
    h.hp = 10;
    damagePlayer(ctx, 50);
    expect(died).toBe(true);
    expect(ctx.run.adrenalineUsed).toBe(false);
  });
});
