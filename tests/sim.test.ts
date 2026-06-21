import { describe, it, expect } from 'vitest';
import { runHeadless } from '../src/sim/headless';

/**
 * The headless sim is the crash-net: it runs the full system pipeline thousands of times.
 * If any system throws on a real game state, these tests fail in CI — no browser needed.
 * It's also the engine behind the MCP `balance_sim` tool.
 */
describe('headless sim', () => {
  it('runs a full minute without throwing and yields sane metrics', () => {
    const r = runHeadless(12345, 60);
    expect(r.survivedSec).toBeGreaterThan(0);
    expect(r.kills).toBeGreaterThan(0);
    expect(r.level).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic for a fixed seed', () => {
    expect(runHeadless(777, 30)).toEqual(runHeadless(777, 30));
  });

  it('the scripted player survives the early game on several seeds', () => {
    for (const s of [1, 2, 3]) {
      expect(runHeadless(s, 40).survivedSec).toBeGreaterThan(3);
    }
  });
});
