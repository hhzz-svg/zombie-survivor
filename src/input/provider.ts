import type { Input } from './input';
import type { TouchControls } from './touch';
import { resolveAim } from './stick';

/** Swappable source of player intent: keyboard/mouse in-game, AI in the headless sim. */
export interface InputProvider {
  /** Normalized [-1,1] movement axis. */
  axis(): { x: number; y: number };
  /** Unit aim vector originating at the player world position (px, py). */
  aim(px: number, py: number): { x: number; y: number };
}

/**
 * Keyboard + mouse, with touch layered on top when a thumbstick is in play. The player is
 * always screen-centred, so mouse aim is simply mouse − centre.
 *
 * Both sources stay live rather than the device picking one at startup: a touchscreen
 * laptop, a tablet with a keyboard, or a phone handed to someone mid-run all work without
 * anything having to detect what kind of machine this is.
 */
export class DomInput implements InputProvider {
  private lastAim = { x: 1, y: 0 };

  constructor(
    private keys: Input,
    private view: { width: number; height: number },
    private touch?: TouchControls,
  ) {}

  axis(): { x: number; y: number } {
    const stick = this.touch?.axis();
    if (stick && (stick.x !== 0 || stick.y !== 0)) return stick;
    return this.keys.axis();
  }

  aim(_px: number, _py: number): { x: number; y: number } {
    if (this.touch?.engaged) {
      const next = resolveAim(this.touch.aimStick(), this.axis(), this.lastAim);
      this.lastAim = next;
      return next;
    }
    const dx = this.keys.mouseX - this.view.width / 2;
    const dy = this.keys.mouseY - this.view.height / 2;
    const d = Math.hypot(dx, dy) || 1;
    const next = { x: dx / d, y: dy / d };
    this.lastAim = next;
    return next;
  }
}
