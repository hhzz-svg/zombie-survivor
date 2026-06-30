import type { GameContext } from './ctx';
import { Health } from './components';
import { currentRunStage } from './data/balance';

export const INTRO_RAMP_SECONDS = 20;
export const INTRO_PICKUP_SECONDS = 30;

export function introSpawnMultiplier(elapsed: number): number {
  if (elapsed >= INTRO_RAMP_SECONDS) return 1;
  return 0.5 + (0.5 * Math.max(0, elapsed)) / INTRO_RAMP_SECONDS;
}

export function pickupRangeMultiplier(elapsed: number, magnet: number): number {
  const onboarding = elapsed < INTRO_PICKUP_SECONDS ? 1.75 : 1;
  return (1 + magnet) * onboarding;
}

export function stageRewardFor(stageIndex: number): { gold: number; heal: number } {
  return stageIndex <= 1 ? { gold: 0, heal: 0 } : { gold: 6 + stageIndex * 2, heal: 10 };
}

export function runFlowSystem(ctx: GameContext): void {
  const stage = currentRunStage(ctx.time.elapsed);
  const previous = ctx.director.stageIndex ?? 1;
  if (stage.index <= previous) return;

  ctx.director.stageIndex = stage.index;
  ctx.director.stageBannerUntil = ctx.time.elapsed + 1.5;
  const reward = stageRewardFor(stage.index);
  ctx.equip.gold += reward.gold;
  const health = ctx.world.get(ctx.player, Health);
  if (health) health.hp = Math.min(health.max, health.hp + reward.heal);
}
