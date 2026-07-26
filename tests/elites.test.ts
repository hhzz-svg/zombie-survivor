import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { eliteChance, ELITE_FROM } from '../src/data/balance';
import { ELITE_AFFIXES, rollEliteAffix, TOXIC_DEATH_BOLTS } from '../src/data/elites';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemyAt } from '../src/factory';
import { killEnemy } from '../src/systems/combat';
import { Bullet, Collider, Enemy, GoldCoin, Health, XPGem } from '../src/components';

describe('elite enemies', () => {
  it('elite chance is gated then ramps to a cap', () => {
    expect(eliteChance(0)).toBe(0);
    expect(eliteChance(ELITE_FROM - 1)).toBe(0);
    expect(eliteChance(ELITE_FROM)).toBeCloseTo(0.04);
    expect(eliteChance(10_000)).toBeCloseTo(0.12);
  });

  it('rollEliteAffix is deterministic under a seeded rng', () => {
    let i = 0;
    const seq = [0.05, 0.5, 0.95];
    const rng = () => seq[i++ % seq.length]!;
    expect(rollEliteAffix(rng).id).toBe(ELITE_AFFIXES[0]!.id);
    expect(rollEliteAffix(rng).id).toBe(ELITE_AFFIXES[1]!.id);
    expect(rollEliteAffix(rng).id).toBe(ELITE_AFFIXES[2]!.id);
  });

  it('an elite spawn scales hp, radius, and carries the affix', () => {
    const ctx = makeCtx();
    const affix = ELITE_AFFIXES.find((a) => a.id === 'mighty')!;
    const plain = spawnEnemyAt(ctx, ENEMIES['walker']!, 100, 0);
    const elite = spawnEnemyAt(ctx, ENEMIES['walker']!, 200, 0, affix);

    const plainHp = ctx.world.get(plain, Health)!.max;
    const eliteHp = ctx.world.get(elite, Health)!.max;
    expect(eliteHp).toBeCloseTo(plainHp * affix.hpMul);
    expect(ctx.world.get(elite, Collider)!.r).toBeCloseTo(ENEMIES['walker']!.radius * affix.radiusMul);
    expect(ctx.world.get(elite, Enemy)!.elite?.id).toBe('mighty');
  });

  it('killing an elite multiplies XP, counts the tally, and toxic bursts acid', () => {
    const ctx = makeCtx();
    const affix = ELITE_AFFIXES.find((a) => a.id === 'toxic')!;
    const elite = spawnEnemyAt(ctx, ENEMIES['walker']!, 60, 0, affix);

    killEnemy(ctx, elite);

    expect(ctx.run.elitesKilled).toBe(1);
    const gems = ctx.world.query(XPGem);
    expect(gems).toHaveLength(1);
    expect(ctx.world.get(gems[0]!, XPGem)!.value).toBe(ENEMIES['walker']!.xp * affix.xpMul);
    const acid = ctx.world.query(Bullet).filter((b) => ctx.world.get(b, Bullet)!.team === 'enemy');
    expect(acid).toHaveLength(TOXIC_DEATH_BOLTS);
  });

  it('golden runner erupts into a coin fountain on kill', () => {
    const ctx = makeCtx();
    const golden = spawnEnemyAt(ctx, ENEMIES['golden']!, 80, 0);
    killEnemy(ctx, golden);
    const coins = ctx.world.query(GoldCoin);
    expect(coins.length).toBeGreaterThanOrEqual(11); // base drop + 10 fountain coins
  });
});
