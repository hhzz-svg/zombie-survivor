import type { World } from '../ecs/world';
import { Transform, Velocity } from '../components';

/**
 * Integrate position from velocity. Pure logic: no rendering, no wall-clock, no Math.random —
 * so it runs identically inside the headless sim.
 */
export function movementSystem(world: World, dt: number): void {
  for (const e of world.query(Transform, Velocity)) {
    const t = world.get(e, Transform)!;
    const v = world.get(e, Velocity)!;
    t.x += v.x * dt;
    t.y += v.y * dt;
  }
}
