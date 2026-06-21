import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../src/ecs/spatialHash';

describe('SpatialHash', () => {
  it('returns ids near the query and omits far ones', () => {
    const h = new SpatialHash(32);
    h.insert(1, 0, 0);
    h.insert(2, 10, 10);
    h.insert(3, 600, 600);
    const out: number[] = [];
    h.query(0, 0, 30, out);
    expect(out).toContain(1);
    expect(out).toContain(2);
    expect(out).not.toContain(3);
  });

  it('clear empties the grid', () => {
    const h = new SpatialHash(32);
    h.insert(1, 0, 0);
    h.clear();
    const out: number[] = [];
    h.query(0, 0, 100, out);
    expect(out).toEqual([]);
  });
});
