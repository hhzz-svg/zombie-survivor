import { describe, it, expect } from 'vitest';
import { runHeadless } from '../src/sim/headless';
import { AiInput } from '../src/sim/aiInput';
import { makeCtx } from './helpers';
import { purchaseOffer, currentShopOffers } from '../src/shop';
import { spawnEnemyAt } from '../src/factory';
import { ENEMIES } from '../src/data/enemies';
import { rebuildEnemyHash } from '../src/systems/pipeline';
import { EQUIPMENT } from '../src/data/equipment';
import { Transform } from '../src/components';

describe('sim options', () => {
  it('starts each operative with their own weapon', () => {
    expect(runHeadless(3, 8, { operative: 'juggernaut' }).weapons[0]).toMatch(/^shotgun:/);
    expect(runHeadless(3, 8, { operative: 'hunter' }).weapons[0]).toMatch(/^magnum:/);
    expect(runHeadless(3, 8, { operative: 'ranger' }).operative).toBe('ranger');
  });

  it('stays deterministic for each option set', () => {
    const opts = { operative: 'hunter', policy: 'greedy' as const, talents: { caliber: 2 } };
    expect(runHeadless(99, 40, opts)).toEqual(runHeadless(99, 40, opts));
  });

  it('actually uses the choice policy', () => {
    // Any single seed can coincide, so require the two policies to diverge somewhere.
    const diverged = [11, 12, 13, 14].some(
      (s) => JSON.stringify(runHeadless(s, 120, { policy: 'greedy' }))
        !== JSON.stringify(runHeadless(s, 120, { policy: 'first' })),
    );
    expect(diverged).toBe(true);
  });

  it('actually shops when the shop is enabled, and never otherwise', () => {
    // Gold held at the end is the wrong probe: the run that never shops dies earlier and so
    // earns less. Owned skills are direct evidence the purchase path ran.
    //
    // Spread over several seeds rather than pinning one: any single run's build (and so how
    // far it gets) shifts whenever the weapon pool changes, which is not what this asserts.
    const seeds = [11, 12, 13, 14];
    expect(seeds.some((s) => runHeadless(s, 220, { shop: true }).skills.length > 0)).toBe(true);
    for (const s of seeds) expect(runHeadless(s, 220, { shop: false }).skills).toEqual([]);
  });

  it('applies talents to the run it reports on', () => {
    const plain = runHeadless(7, 20, {});
    const geared = runHeadless(7, 20, { talents: { warchest: 4 } });
    // 4 × 25 opening gold has to show up somewhere by second 20.
    expect(geared.gold).toBeGreaterThan(plain.gold);
  });

  it('reports a loadout the report can parse, and a cause when it dies', () => {
    const r = runHeadless(5, 120);
    for (const entry of [...r.weapons, ...r.passives]) {
      expect(entry).toMatch(/^[a-z-]+:\d+$/);
    }
    expect(r.cause.length).toBeGreaterThan(0);
    if (!r.died) expect(r.cause).toBe('存活到时间上限');
  });
});

describe('scripted player', () => {
  it('minimises the threat field when steering is judged on threat alone', () => {
    const ctx = makeCtx();
    const ai = new AiInput();
    // Momentum, loot and boss-seek off: this asserts the threat field itself, not the
    // shipped policy.
    ai.tuning = { momentum: 0, loot: 0, soften: 900, boss: 0 };
    ai.ctx = ctx;
    spawnEnemyAt(ctx, ENEMIES['walker'], 60, 0);
    rebuildEnemyHash(ctx);

    const dir = ai.axis();

    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1); // always a unit heading
    expect(dir.x).toBeLessThan(0); // the threat is east
  });

  it('closes on a distant boss instead of only fleeing it', () => {
    // A boss is weighted six times a walker in the threat field, so steering on threat alone
    // walks AWAY from one. That is survivable against a boss that charges and fatal against
    // the siege boss, which retreats below 260px: the two thresholds lock into a standoff and
    // the fight never happens. Asserted as a sign flip rather than an angle, because the
    // point is the direction of the decision, not its precision.
    const west = (boss: number): number => {
      const ctx = makeCtx();
      const ai = new AiInput();
      ai.tuning = { momentum: 0, loot: 0, soften: 900, boss };
      ai.ctx = ctx;
      spawnEnemyAt(ctx, ENEMIES['siege'], -600, 0); // out past BOSS_ENGAGE, due west
      rebuildEnemyHash(ctx);
      return ai.axis().x;
    };

    expect(west(0)).toBeGreaterThan(0); // old behaviour: backs away from the boss
    expect(west(4)).toBeLessThan(0); // with the seek term: goes to meet it
  });

  it('stops closing once the boss is inside engagement range', () => {
    // The pull has to hand back to the threat field, or the bot walks into contact damage.
    const ctx = makeCtx();
    const ai = new AiInput();
    ai.tuning = { momentum: 0, loot: 0, soften: 900, boss: 4 };
    ai.ctx = ctx;
    spawnEnemyAt(ctx, ENEMIES['siege'], -150, 0); // inside BOSS_ENGAGE
    rebuildEnemyHash(ctx);

    expect(ai.axis().x).toBeGreaterThan(0); // threat field is back in charge
  });

  it('commits to a heading under the shipped weights rather than re-deciding every frame', () => {
    // Measured, not assumed: `npm run balance` puts the committed bot at a 17% win rate and a
    // 260s median, against 3% and 189s for one that always takes the locally safest step.
    const ctx = makeCtx();
    const ai = new AiInput();
    ai.ctx = ctx;
    for (let i = -3; i <= 3; i++) spawnEnemyAt(ctx, ENEMIES['walker'], 180, i * 40);
    rebuildEnemyHash(ctx);

    const first = ai.axis();
    const second = ai.axis();
    expect(second).toEqual(first); // no dithering while the field is unchanged
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(1);
    // Note what is deliberately NOT asserted: that it turns away. With the shipped weights a
    // committed heading can carry it into a distant pack, and the sweep says that trade wins
    // more runs than re-deciding every frame does. Threat-minimising behaviour is covered by
    // the momentum-off test above.
  });

  it('aims at the boss over the trash standing closer', () => {
    const ctx = makeCtx();
    const ai = new AiInput();
    ai.ctx = ctx;
    spawnEnemyAt(ctx, ENEMIES['walker'], 40, 0);
    spawnEnemyAt(ctx, ENEMIES['boss'], -300, 0);
    rebuildEnemyHash(ctx);

    expect(ai.aim(0, 0).x).toBeLessThan(0);
  });

  it('holds a heading with nothing around rather than jittering', () => {
    const ctx = makeCtx();
    const ai = new AiInput();
    ai.ctx = ctx;
    const first = ai.axis();
    const second = ai.axis();
    expect(second).toEqual(first);
  });
});

describe('shop transactions are shared with the game', () => {
  it('deducts gold and grants the item', () => {
    const ctx = makeCtx();
    const def = EQUIPMENT.find((e) => e.id === 'heal')!;
    ctx.equip.gold = def.cost;
    const offer = currentShopOffers(ctx).find((o) => o.id === 'heal')!;

    expect(purchaseOffer(ctx, offer)).toBe(true);
    expect(ctx.equip.gold).toBe(0);
    expect(ctx.equip.charges.get('heal')).toBe(1);
  });

  it('refuses and changes nothing when the gold is short', () => {
    const ctx = makeCtx();
    const offer = currentShopOffers(ctx).find((o) => o.id === 'heal')!;
    ctx.equip.gold = 1;

    expect(purchaseOffer(ctx, offer)).toBe(false);
    expect(ctx.equip.gold).toBe(1);
    expect(ctx.equip.charges.get('heal')).toBeUndefined();
  });

  it('the player position is unchanged by merely aiming', () => {
    const ctx = makeCtx();
    const ai = new AiInput();
    ai.ctx = ctx;
    const p = ctx.world.get(ctx.player, Transform)!;
    ai.aim(p.x, p.y);
    expect([p.x, p.y]).toEqual([0, 0]);
  });
});
