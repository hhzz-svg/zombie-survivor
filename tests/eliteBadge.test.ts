import { describe, it, expect } from 'vitest';
import { drawEliteBadge } from '../src/render/eliteBadge';
import { ELITE_AFFIXES, type EliteBadge } from '../src/data/elites';
import type { Renderer } from '../src/render/renderer';

type Call = { op: string; args: number[] };

/**
 * A renderer that records geometry instead of drawing it. Colour is deliberately dropped:
 * these assertions are about what survives when colour does not.
 */
function recorder(): { r: Renderer; calls: Call[] } {
  const calls: Call[] = [];
  const nums = (a: unknown[]) => a.filter((v): v is number => typeof v === 'number');
  const r = new Proxy({} as Renderer, {
    get: (_t, op: string) => (...args: unknown[]) => {
      calls.push({ op, args: nums(args).map((n) => Math.round(n * 100) / 100) });
    },
  });
  return { r, calls };
}

function geometry(badge: EliteBadge): string {
  const { r, calls } = recorder();
  drawEliteBadge(r, badge, 0, 0, 12, '#ffffff');
  return calls.map((c) => `${c.op}(${c.args.join(',')})`).join('|');
}

describe('elite badges', () => {
  it('gives every affix a badge', () => {
    for (const a of ELITE_AFFIXES) expect(a.badge).toBeTruthy();
  });

  it('draws a different silhouette for every affix', () => {
    const shapes = ELITE_AFFIXES.map((a) => geometry(a.badge));
    expect(new Set(shapes).size).toBe(ELITE_AFFIXES.length);
  });

  it('separates the badges by kind of primitive, not only by coordinates', () => {
    // chevron and wedge are strokes; dots is the only one built from discs. If someone
    // redraws one of them as another, colour becomes the only channel again.
    const ops = (badge: EliteBadge) => {
      const { r, calls } = recorder();
      drawEliteBadge(r, badge, 0, 0, 12, '#fff');
      return new Set(calls.map((c) => c.op));
    };
    expect(ops('dots').has('drawCircle')).toBe(true);
    expect(ops('chevron').has('drawCircle')).toBe(false);
    expect(ops('wedge').has('drawCircle')).toBe(false);
    // and the two stroked badges differ in how many segments they lay down
    const count = (badge: EliteBadge) => {
      const { r, calls } = recorder();
      drawEliteBadge(r, badge, 0, 0, 12, '#fff');
      return calls.length;
    };
    expect(count('chevron')).not.toBe(count('wedge'));
  });

  it('every badge is backed by a near-black pass so it reads over any sprite', () => {
    for (const a of ELITE_AFFIXES) {
      const colors: string[] = [];
      const r = new Proxy({} as Renderer, {
        get: () => (...args: unknown[]) => {
          for (const v of args) if (typeof v === 'string' && v.startsWith('#')) colors.push(v);
        },
      });
      drawEliteBadge(r, a.badge, 0, 0, 12, a.color);
      expect(colors).toContain('#0b1013');
    }
  });

  it('never collapses to nothing at the smallest size it is drawn at', () => {
    for (const a of ELITE_AFFIXES) {
      const { r, calls } = recorder();
      drawEliteBadge(r, a.badge, 0, 0, 1, a.color);
      expect(calls.length).toBeGreaterThan(0);
    }
  });
});
