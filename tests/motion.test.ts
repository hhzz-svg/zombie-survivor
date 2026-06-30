import { describe, expect, it } from 'vitest';
import { actorDepth, recoilAmount, walkMotion } from '../src/render/motion';

describe('actor motion', () => {
  it('sorts actors by their feet, not sprite center', () => {
    expect(actorDepth(100, 20)).toBe(120);
    expect(actorDepth(110, 5)).toBe(115);
  });

  it('keeps idle actors still and moving actors readable', () => {
    expect(walkMotion(1000, 0, 0, 1)).toEqual({ bob: 0, squash: 0, rock: 0, step: 0 });
    expect(Math.abs(walkMotion(1000, 120, 0, 1).bob)).toBeGreaterThan(0);
  });

  it('decays weapon kick across a cooldown', () => {
    expect(recoilAmount(0.22, 0.22)).toBeCloseTo(1);
    expect(recoilAmount(0.11, 0.22)).toBeCloseTo(0);
  });
});
