import { describe, expect, it } from 'vitest';
import { makeCtx } from './helpers';
import { activeSurge, incomingSurge, SURGES, SURGE_WARN_SECONDS, SURGE_GOLD_MUL } from '../src/data/balance';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemyAt } from '../src/factory';
import { killEnemy } from '../src/systems/combat';
import { GoldCoin } from '../src/components';

describe('blood-moon surges', () => {
  it('activates exactly inside each configured window', () => {
    const s = SURGES[0]!;
    expect(activeSurge(s.at - 0.01)).toBeNull();
    expect(activeSurge(s.at)).toBe(s);
    expect(activeSurge(s.at + s.duration - 0.01)).toBe(s);
    expect(activeSurge(s.at + s.duration)).toBeNull();
  });

  it('warns ahead of the window, then hands over to the active state', () => {
    const s = SURGES[0]!;
    expect(incomingSurge(s.at - SURGE_WARN_SECONDS - 0.01)).toBeNull();
    expect(incomingSurge(s.at - SURGE_WARN_SECONDS)).toBe(s);
    expect(incomingSurge(s.at - 0.01)).toBe(s);
    expect(incomingSurge(s.at)).toBeNull();
  });

  it('keeps cycling blood moons for endless runs past the scripted list', () => {
    expect(activeSurge(250)).toBeNull(); // between scripted list and the cycle
    expect(activeSurge(300)).toEqual({ at: 300, duration: 16 });
    expect(activeSurge(315.9)).toEqual({ at: 300, duration: 16 });
    expect(activeSurge(316)).toBeNull();
    expect(activeSurge(452)).toEqual({ at: 450, duration: 16 });
    expect(incomingSurge(297)).toEqual({ at: 300, duration: 16 });
    expect(incomingSurge(447)).toEqual({ at: 450, duration: 16 });
    expect(incomingSurge(310)).toBeNull(); // inside a storm nothing is "incoming"
  });

  it('kills during a surge drop boosted gold', () => {
    const surge = SURGES[0]!;

    const quiet = makeCtx(7);
    quiet.time.elapsed = surge.at - 10;
    killEnemy(quiet, spawnEnemyAt(quiet, ENEMIES['walker']!, 50, 0));
    const quietGold = quiet.world.query(GoldCoin)
      .reduce((a, c) => a + quiet.world.get(c, GoldCoin)!.value, 0);

    const stormy = makeCtx(7);
    stormy.time.elapsed = surge.at + 1;
    killEnemy(stormy, spawnEnemyAt(stormy, ENEMIES['walker']!, 50, 0));
    const stormyGold = stormy.world.query(GoldCoin)
      .reduce((a, c) => a + stormy.world.get(c, GoldCoin)!.value, 0);

    // same seed → same jitter roll, so the only difference is the surge multiplier
    expect(stormyGold).toBeGreaterThan(quietGold);
    // rounding happens on the raw product, so allow ±1 around the scaled value
    expect(Math.abs(stormyGold - quietGold * SURGE_GOLD_MUL)).toBeLessThanOrEqual(1);
  });
});
