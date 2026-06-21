import { describe, it, expect } from 'vitest';
import { World } from '../src/ecs/world';
import { makeRng } from '../src/ecs/rng';
import { Transform, Velocity } from '../src/components';
import { movementSystem } from '../src/systems/movement';

describe('ECS World', () => {
  it('creates, adds, gets components', () => {
    const w = new World(makeRng(1));
    const e = w.create();
    w.add(e, Transform, { x: 1, y: 2, rot: 0 });
    expect(w.get(e, Transform)).toEqual({ x: 1, y: 2, rot: 0 });
    expect(w.has(e, Velocity)).toBe(false);
  });

  it('query returns only entities that have ALL components', () => {
    const w = new World(makeRng(1));
    const a = w.create();
    w.add(a, Transform, { x: 0, y: 0, rot: 0 });
    w.add(a, Velocity, { x: 0, y: 0 });
    const b = w.create();
    w.add(b, Transform, { x: 0, y: 0, rot: 0 });
    expect(w.query(Transform, Velocity)).toEqual([a]);
    expect(w.query(Transform).sort()).toEqual([a, b].sort());
  });

  it('recycles entity ids after destroy', () => {
    const w = new World(makeRng(1));
    const a = w.create();
    w.destroy(a);
    expect(w.create()).toBe(a);
  });

  it('remove deletes a single component without touching others', () => {
    const w = new World(makeRng(1));
    const e = w.create();
    w.add(e, Transform, { x: 0, y: 0, rot: 0 });
    w.add(e, Velocity, { x: 1, y: 1 });
    w.remove(e, Velocity);
    expect(w.has(e, Velocity)).toBe(false);
    expect(w.has(e, Transform)).toBe(true);
  });
});

describe('movementSystem', () => {
  it('integrates position = velocity * dt deterministically', () => {
    const w = new World(makeRng(1));
    const e = w.create();
    w.add(e, Transform, { x: 0, y: 0, rot: 0 });
    w.add(e, Velocity, { x: 60, y: -30 });
    movementSystem(w, 0.5);
    expect(w.get(e, Transform)).toEqual({ x: 30, y: -15, rot: 0 });
  });
});

describe('seeded RNG', () => {
  it('same seed produces the same sequence', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('produces values in [0, 1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
