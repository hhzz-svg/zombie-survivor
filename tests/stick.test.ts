import { describe, it, expect } from 'vitest';
import {
  stickVector, knobOffset, resolveAim, CENTRED,
  STICK_RADIUS, STICK_DEADZONE,
} from '../src/input/stick';

describe('stickVector', () => {
  it('reads as centred inside the deadzone', () => {
    // A thumb resting on glass drifts a few px; that must not be movement.
    expect(stickVector(0, 0)).toEqual(CENTRED);
    expect(stickVector(STICK_RADIUS * STICK_DEADZONE * 0.9, 0).magnitude).toBe(0);
  });

  it('ramps from zero at the deadzone edge to one at the rim', () => {
    const justOut = stickVector(STICK_RADIUS * STICK_DEADZONE + 0.5, 0);
    expect(justOut.magnitude).toBeGreaterThan(0);
    expect(justOut.magnitude).toBeLessThan(0.1); // a slow walk, not a jump to 16%
    expect(stickVector(STICK_RADIUS, 0).magnitude).toBeCloseTo(1);
  });

  it('clamps past the rim instead of running faster', () => {
    expect(stickVector(STICK_RADIUS * 6, 0).magnitude).toBe(1);
    expect(stickVector(STICK_RADIUS * 6, 0).x).toBeCloseTo(1);
  });

  it('always returns a unit direction, whatever the distance', () => {
    for (const [dx, dy] of [[30, 40], [-80, 60], [5, -400], [-1000, -1000]]) {
      const v = stickVector(dx, dy);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    }
  });

  it('survives junk coordinates rather than steering to NaN', () => {
    for (const v of [stickVector(NaN, 0), stickVector(0, Infinity), stickVector(NaN, NaN)]) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.magnitude)).toBe(true);
    }
  });
});

describe('knobOffset', () => {
  it('follows the thumb inside the ring and sticks to the rim outside it', () => {
    expect(knobOffset(10, 0)).toEqual({ x: 10, y: 0 });
    const far = knobOffset(500, 0);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(STICK_RADIUS);
  });

  it('has no opinion at the exact centre', () => {
    expect(knobOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('resolveAim', () => {
  const still = { x: 0, y: 0 };

  it('follows the aim stick while it is held', () => {
    const aim = resolveAim({ x: 0, y: -1, magnitude: 0.5 }, { x: 1, y: 0 }, { x: -1, y: 0 });
    expect(aim).toEqual({ x: 0, y: -1 });
  });

  it('points where you are walking when the player has never used the aim stick', () => {
    const aim = resolveAim(CENTRED, { x: 0.6, y: 0.8 }, { x: -1, y: 0 });
    expect(aim.x).toBeCloseTo(0.6);
    expect(aim.y).toBeCloseTo(0.8);
  });

  it('HOLDS the aim after release once the player aims deliberately', () => {
    // The bug this guards: movement used to outrank the last heading, so letting go of the
    // aim stick while still walking threw the aim away and the right half of the screen
    // read as broken.
    const held = resolveAim(CENTRED, { x: 0.6, y: 0.8 }, { x: -1, y: 0 }, true);
    expect(held).toEqual({ x: -1, y: 0 });
  });

  it('still follows the feet for a deliberate aimer who has no heading yet', () => {
    const aim = resolveAim(CENTRED, { x: 0, y: 1 }, { x: 0, y: 0 }, true);
    expect(aim).toEqual({ x: 0, y: 1 });
  });

  it('lets the stick override the held heading while it is down', () => {
    const aim = resolveAim({ x: 1, y: 0, magnitude: 0.4 }, { x: 0, y: 1 }, { x: -1, y: 0 }, true);
    expect(aim).toEqual({ x: 1, y: 0 });
  });

  it('holds the last aim when standing still, rather than snapping', () => {
    expect(resolveAim(CENTRED, still, { x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
  });

  it('never returns a zero vector — the guns fire on their own', () => {
    const aim = resolveAim(CENTRED, still, still);
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(1);
  });

  it('always returns a unit vector', () => {
    const cases: Array<[typeof CENTRED, { x: number; y: number }, { x: number; y: number }]> = [
      [{ x: 3, y: 4, magnitude: 1 }, still, still],
      [CENTRED, { x: 3, y: 4 }, still],
      [CENTRED, still, { x: -6, y: 8 }],
    ];
    for (const [s, m, l] of cases) {
      const aim = resolveAim(s, m, l);
      expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(1);
    }
  });
});
