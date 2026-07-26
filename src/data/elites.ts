/**
 * Elite affixes: a spawned enemy can carry one, scaling its stats and rewards.
 * The affix is runtime state layered on top of the shared immutable EnemyDef,
 * so the def table stays untouched and the sim stays deterministic.
 */

export interface EliteAffix {
  id: 'swift' | 'mighty' | 'toxic';
  name: string; // shown above the enemy
  color: string; // aura + name-tag color
  hpMul: number;
  speedMul: number;
  dmgMul: number; // contact damage multiplier
  radiusMul: number; // body + collider scale
  xpMul: number;
  goldMul: number;
}

export const ELITE_AFFIXES: readonly EliteAffix[] = [
  { id: 'swift', name: '迅捷', color: '#ffd166', hpMul: 1.8, speedMul: 1.65, dmgMul: 1.1, radiusMul: 1.15, xpMul: 4, goldMul: 4 },
  { id: 'mighty', name: '巨力', color: '#ff5252', hpMul: 3.2, speedMul: 0.9, dmgMul: 1.6, radiusMul: 1.35, xpMul: 5, goldMul: 5 },
  { id: 'toxic', name: '剧毒', color: '#7be23a', hpMul: 2.2, speedMul: 1.1, dmgMul: 1.2, radiusMul: 1.2, xpMul: 4, goldMul: 4 },
];

/** Number of acid bolts a toxic elite releases on death. */
export const TOXIC_DEATH_BOLTS = 10;

export function rollEliteAffix(rng: () => number): EliteAffix {
  return ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)]!;
}
