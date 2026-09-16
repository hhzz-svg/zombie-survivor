/**
 * The maths behind an on-screen thumbstick, kept apart from the DOM so it can be tested
 * without a touchscreen — and so the rules about deadzone and clamping live in one place
 * rather than being re-derived inside a pointer handler.
 */

/** How far the knob travels before the stick reads as fully deflected. */
export const STICK_RADIUS = 52;

/**
 * Below this fraction of the radius the stick reads as centred. A thumb resting on glass
 * drifts by a few pixels constantly; without a deadzone the player slides while standing
 * still, which in a game about positioning is worse than an unresponsive stick.
 */
export const STICK_DEADZONE = 0.16;

export interface StickVector {
  x: number;
  y: number;
  /** 0 when inside the deadzone, ramping to 1 at the rim. */
  magnitude: number;
}

export const CENTRED: StickVector = { x: 0, y: 0, magnitude: 0 };

/**
 * Knob offset from the stick's origin, in px, to a direction and strength.
 *
 * Magnitude is rescaled across the live band rather than taken raw, so the first pixel
 * outside the deadzone is a slow walk instead of a jump to 16% speed.
 */
export function stickVector(
  dx: number,
  dy: number,
  radius = STICK_RADIUS,
  deadzone = STICK_DEADZONE,
): StickVector {
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist <= radius * deadzone) return CENTRED;
  const clamped = Math.min(dist, radius);
  const live = (clamped / radius - deadzone) / (1 - deadzone);
  return { x: dx / dist, y: dy / dist, magnitude: Math.min(1, Math.max(0, live)) };
}

/** Where the knob should be drawn: the touch point, reeled in to the stick's rim. */
export function knobOffset(dx: number, dy: number, radius = STICK_RADIUS): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist === 0) return { x: 0, y: 0 };
  const scale = Math.min(1, radius / dist);
  return { x: dx * scale, y: dy * scale };
}

/**
 * What the player is aiming at, in precedence order:
 *
 *   1. the aim stick, while a thumb is on it;
 *   2. the direction they are moving, so one-thumb play still points the guns forward;
 *   3. the last direction that was deliberately chosen, so letting go does not snap the
 *      aim somewhere arbitrary while the player is standing still.
 *
 * Weapons fire on their own, so an aim of (0,0) would be a stream of shots into the floor —
 * hence the final fallback to a fixed direction rather than nothing.
 */
export function resolveAim(
  aimStick: StickVector,
  move: { x: number; y: number },
  last: { x: number; y: number },
): { x: number; y: number } {
  if (aimStick.magnitude > 0) return unit(aimStick.x, aimStick.y) ?? { x: 1, y: 0 };
  return unit(move.x, move.y) ?? unit(last.x, last.y) ?? { x: 1, y: 0 };
}

/**
 * Normalise, or null when there is no direction to speak of. Every candidate goes through
 * here rather than the aim stick being trusted to arrive normalised — this function
 * promises a unit vector, so it is the one that has to make it true.
 */
function unit(x: number, y: number): { x: number; y: number } | null {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len === 0) return null;
  return { x: x / len, y: y / len };
}
