import { describe, it, expect, beforeEach } from 'vitest';
import { formatSeed, parseSeed, randomSeed, dailyKey, dailySeed } from '../src/seed';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings';
import { runHeadless } from '../src/sim/headless';

describe('run seeds', () => {
  it('round-trips every seed it prints', () => {
    for (const n of [0, 1, 42, 999999, 0x7fffffff, 0xffffffff, randomSeed(), randomSeed()]) {
      expect(parseSeed(formatSeed(n))).toBe(n >>> 0);
    }
  });

  it('prints a short, padded, case-insensitive code', () => {
    const code = formatSeed(1234567);
    expect(code).toMatch(/^[0-9A-Z]{6,7}$/);
    expect(parseSeed(code.toLowerCase())).toBe(parseSeed(code));
    expect(parseSeed(`  ${code}  `)).toBe(parseSeed(code));
  });

  it('rejects input that is not a seed', () => {
    for (const bad of ['', '   ', 'hello world', '!!!', 'ABCDEFGHI', '-5']) {
      expect(parseSeed(bad)).toBeNull();
    }
  });

  it('gives every player on the same date the same world', () => {
    expect(dailySeed('2026-09-12')).toBe(dailySeed('2026-09-12'));
    expect(dailySeed('2026-09-12')).not.toBe(dailySeed('2026-09-13'));
    expect(dailySeed('2026-09-12')).toBeGreaterThanOrEqual(0);
    expect(dailySeed('2026-09-12')).toBeLessThanOrEqual(0xffffffff);
  });

  it('keys the daily by local date', () => {
    expect(dailyKey(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(dailyKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('a shared seed is a shared run', () => {
  it('replays identically from the printed code — the promise the UI makes', () => {
    const original = 0x51ed5eed;
    const typedBackIn = parseSeed(formatSeed(original))!;
    expect(runHeadless(typedBackIn, 30)).toEqual(runHeadless(original, 30));
  });

  it("today's daily is the same run for everyone on that date", () => {
    expect(runHeadless(dailySeed('2026-09-12'), 25)).toEqual(runHeadless(dailySeed('2026-09-12'), 25));
  });
});

describe('settings', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it('falls back to defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved profile', () => {
    const custom = { volume: 0.25, muted: true, shake: 0, reduceFlashing: true, damageNumbers: false };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
  });

  it('clamps nonsense instead of trusting stored values', () => {
    localStorage.setItem('zs-settings', JSON.stringify({ volume: 99, shake: -4 }));
    const s = loadSettings();
    expect(s.volume).toBe(1);
    expect(s.shake).toBe(0);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('zs-settings', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
