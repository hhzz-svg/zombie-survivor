export interface WalkMotion {
  bob: number;
  squash: number;
  rock: number;
  step: number;
}

export function actorDepth(y: number, radius: number): number {
  return y + radius;
}

export function walkMotion(nowMs: number, speed: number, phase: number, rate = 1): WalkMotion {
  if (speed < 6) return { bob: 0, squash: 0, rock: 0, step: 0 };
  const moving = Math.min(1, speed / 120);
  const w = nowMs / 1000 * 9 * rate + phase * 0.05;
  return {
    bob: Math.abs(Math.sin(w)) * 3.6 * moving,
    squash: -Math.cos(w * 2) * 0.06 * moving,
    rock: Math.sin(w) * 0.07 * moving,
    step: Math.floor(w / Math.PI),
  };
}

export function recoilAmount(cooldown: number, period: number): number {
  if (period <= 0) return 0;
  const phase = cooldown / period;
  return phase > 0.75 ? (phase - 0.75) / 0.25 : 0;
}
