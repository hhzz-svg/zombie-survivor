import { describe, it, expect } from 'vitest';
import {
  OBSTACLE_CELL, cellObstacle, cellBarrel, obstaclesInRect, blockedAt, resolveCircle,
} from '../src/data/obstacles';
import { findObstacle } from './helpers';

describe('obstacle field', () => {
  it('is a pure function of seed and cell', () => {
    for (let i = 0; i < 50; i++) {
      const a = cellObstacle(7, i, -i);
      const b = cellObstacle(7, i, -i);
      expect(a).toEqual(b);
    }
  });

  it('lays out differently for different seeds', () => {
    let differences = 0;
    for (let cx = -10; cx <= 10; cx++) {
      for (let cy = -10; cy <= 10; cy++) {
        if (JSON.stringify(cellObstacle(1, cx, cy)) !== JSON.stringify(cellObstacle(2, cx, cy))) differences++;
      }
    }
    expect(differences).toBeGreaterThan(20);
  });

  it('keeps the opening area clear so a run never starts boxed in', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let cx = -2; cx <= 2; cx++) {
        for (let cy = -2; cy <= 2; cy++) {
          expect(cellObstacle(seed, cx, cy)).toBeNull();
          expect(cellBarrel(seed, cx, cy)).toBeNull();
        }
      }
      expect(blockedAt(seed, 0, 0, 40)).toBe(false);
    }
  });

  it('never lets an obstacle leave its own cell, so neighbours cannot overlap', () => {
    for (let seed = 0; seed < 8; seed++) {
      for (let cx = -12; cx <= 12; cx++) {
        for (let cy = -12; cy <= 12; cy++) {
          const o = cellObstacle(seed, cx, cy);
          if (!o) continue;
          expect(o.x - o.hw).toBeGreaterThanOrEqual(cx * OBSTACLE_CELL);
          expect(o.x + o.hw).toBeLessThanOrEqual((cx + 1) * OBSTACLE_CELL);
          expect(o.y - o.hh).toBeGreaterThanOrEqual(cy * OBSTACLE_CELL);
          expect(o.y + o.hh).toBeLessThanOrEqual((cy + 1) * OBSTACLE_CELL);
        }
      }
    }
  });

  it('a rect query returns every obstacle it covers', () => {
    const seed = 3;
    const out = obstaclesInRect(seed, 0, 0, 3 * OBSTACLE_CELL, 3 * OBSTACLE_CELL, []);
    let expected = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cy = -3; cy <= 3; cy++) if (cellObstacle(seed, cx, cy)) expected++;
    }
    expect(out.length).toBe(expected);
  });

  it('never leaves a circle overlapping cover after a resolve', () => {
    const seed = 11;
    const { o } = findObstacle(seed);
    for (const [dx, dy] of [[0, 0], [o.hw - 2, 0], [0, o.hh - 2], [-o.hw, -o.hh]]) {
      const res = resolveCircle(seed, o.x + dx!, o.y + dy!, 12);
      expect(res.hit).toBe(true);
      expect(blockedAt(seed, res.x, res.y, 12 - 0.01)).toBe(false);
    }
  });

  it('leaves a circle in the open untouched', () => {
    const res = resolveCircle(5, 0, 0, 12);
    expect(res.hit).toBe(false);
    expect(res.x).toBe(0);
    expect(res.y).toBe(0);
  });
});
