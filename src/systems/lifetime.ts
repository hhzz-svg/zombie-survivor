import type { GameContext } from '../ctx';
import { Lifetime } from '../components';

/** Ages and reaps time-limited entities (bullets, enemy projectiles). */
export function lifetimeSystem(ctx: GameContext, dt: number): void {
  const w = ctx.world;
  for (const e of w.query(Lifetime)) {
    const l = w.get(e, Lifetime)!;
    l.t -= dt;
    if (l.t <= 0) w.destroy(e);
  }
}
