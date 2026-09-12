import type { GameContext } from '../ctx';
import { Barrel, Enemy, Transform } from '../components';
import { movementSystem } from './movement';
import { barrelSystem, blockerSystem } from './collision';
import { directorSystem } from './spawn';
import { inputSystem } from './input';
import { enemyAISystem } from './enemyAI';
import { telegraphSystem } from './telegraph';
import { wingmanSystem } from './wingman';
import { weaponSystem } from './weapons';
import { bulletSystem } from './bullets';
import { contactSystem, pickupSystem } from './player';
import { lifetimeSystem } from './lifetime';
import { equipmentSystem } from './equipment';
import { skillSystem } from './skills';
import { comboSystem } from './combo';
import { supplyDropSystem } from './supply';
import { curseAltarSystem } from './curse';
import { runFlowSystem } from '../runFlow';

/** Rebuild the enemy spatial hash from current positions. */
export function rebuildEnemyHash(ctx: GameContext): void {
  ctx.hash.clear();
  for (const e of ctx.world.query(Enemy, Transform)) {
    const t = ctx.world.get(e, Transform)!;
    ctx.hash.insert(e, t.x, t.y);
  }
  // Barrels join the same hash so bullets, novas, blades and grenades hit them with no
  // extra code in any weapon — contactSystem requires an Enemy component, so they stay
  // harmless to walk into.
  for (const e of ctx.world.query(Barrel, Transform)) {
    const t = ctx.world.get(e, Transform)!;
    ctx.hash.insert(e, t.x, t.y);
  }
}

/**
 * One fixed logic step. Identical between the live game and the headless sim — only the
 * InputProvider differs. Order matters: spawn → hash → input → AI → fire → integrate →
 * resolve collisions → pickups → reap.
 */
export function runSystems(ctx: GameContext, dt: number): void {
  ctx.time.elapsed += dt;
  runFlowSystem(ctx);
  directorSystem(ctx, dt);
  rebuildEnemyHash(ctx);
  inputSystem(ctx);
  enemyAISystem(ctx, dt);
  telegraphSystem(ctx, dt);
  wingmanSystem(ctx, dt);
  weaponSystem(ctx, dt);
  movementSystem(ctx.world, dt);
  blockerSystem(ctx);
  barrelSystem(ctx, dt);
  bulletSystem(ctx, dt);
  contactSystem(ctx, dt);
  pickupSystem(ctx, dt);
  equipmentSystem(ctx, dt);
  skillSystem(ctx, dt);
  comboSystem(ctx, dt);
  supplyDropSystem(ctx, dt);
  curseAltarSystem(ctx, dt);
  lifetimeSystem(ctx, dt);
  ctx.fx.update(dt);
}
