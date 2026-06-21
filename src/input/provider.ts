import type { Input } from './input';

/** Swappable source of player intent: keyboard/mouse in-game, AI in the headless sim. */
export interface InputProvider {
  /** Normalized [-1,1] movement axis. */
  axis(): { x: number; y: number };
  /** Unit aim vector originating at the player world position (px, py). */
  aim(px: number, py: number): { x: number; y: number };
}

/** Keyboard movement + mouse aim. Player is always screen-centered, so aim = mouse − center. */
export class DomInput implements InputProvider {
  constructor(
    private keys: Input,
    private view: { width: number; height: number },
  ) {}

  axis(): { x: number; y: number } {
    return this.keys.axis();
  }

  aim(_px: number, _py: number): { x: number; y: number } {
    const dx = this.keys.mouseX - this.view.width / 2;
    const dy = this.keys.mouseY - this.view.height / 2;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
}
