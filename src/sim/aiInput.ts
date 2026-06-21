import type { InputProvider } from '../input/provider';
import type { GameContext } from '../ctx';
import { Transform } from '../components';

/**
 * Scripted "player" for the headless sim: kite away from the nearest threat (and drift back
 * toward the arena origin), aim at the nearest enemy. Good enough to exercise every system and
 * survive a while — the point is balance metrics & crash-catching, not optimal play.
 */
export class AiInput implements InputProvider {
  ctx!: GameContext;
  private readonly scratch: number[] = [];

  private nearest(px: number, py: number): { x: number; y: number } | null {
    let r = 160;
    for (let i = 0; i < 4; i++) {
      this.ctx.hash.query(px, py, r, this.scratch);
      if (this.scratch.length > 0) break;
      r *= 2;
    }
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const o of this.scratch) {
      const t = this.ctx.world.get(o, Transform);
      if (!t) continue;
      const d = (t.x - px) ** 2 + (t.y - py) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  axis(): { x: number; y: number } {
    const p = this.ctx.world.get(this.ctx.player, Transform)!;
    const n = this.nearest(p.x, p.y);
    let ax = 0;
    let ay = 0;
    if (n) {
      ax = p.x - n.x;
      ay = p.y - n.y;
      const d = Math.hypot(ax, ay) || 1;
      ax /= d;
      ay /= d;
    }
    ax += -p.x * 0.002; // drift back toward origin
    ay += -p.y * 0.002;
    const d = Math.hypot(ax, ay) || 1;
    return { x: ax / d, y: ay / d };
  }

  aim(px: number, py: number): { x: number; y: number } {
    const n = this.nearest(px, py);
    if (!n) return { x: 1, y: 0 };
    const dx = n.x - px;
    const dy = n.y - py;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
}
