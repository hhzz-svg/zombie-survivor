import type { GameContext } from '../ctx';
import { Transform, Velocity, Aim } from '../components';

/** Reads the swappable InputProvider and writes the player's velocity + aim. */
export function inputSystem(ctx: GameContext): void {
  const t = ctx.world.get(ctx.player, Transform)!;
  const v = ctx.world.get(ctx.player, Velocity)!;
  const aim = ctx.world.get(ctx.player, Aim)!;
  const ax = ctx.input.axis();
  v.x = ax.x * ctx.stats.moveSpeed;
  v.y = ax.y * ctx.stats.moveSpeed;
  const a = ctx.input.aim(t.x, t.y);
  aim.x = a.x;
  aim.y = a.y;
}
