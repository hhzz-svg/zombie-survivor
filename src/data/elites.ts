import { tr } from '../i18n';
/**
 * Elite affixes: a spawned enemy can carry one, scaling its stats and rewards.
 * The affix is runtime state layered on top of the shared immutable EnemyDef,
 * so the def table stays untouched and the sim stays deterministic.
 */

/**
 * The shape drawn over an elite's head. Colour alone cannot carry this: the three affix
 * colours are amber / red / green, and red-green is the most common form of colour
 * blindness — under deuteranopia 巨力 and 剧毒 are the same muddy yellow. The badge is the
 * channel that survives, and it reads at any distance; the colour stays as a redundant
 * second channel for everyone else.
 */
export type EliteBadge = 'chevron' | 'wedge' | 'dots';

export interface EliteAffix {
  id: 'swift' | 'mighty' | 'toxic';
  name: string; // shown above the enemy
  color: string; // aura + name-tag color
  badge: EliteBadge; // colour-independent silhouette — see EliteBadge
  hpMul: number;
  speedMul: number;
  dmgMul: number; // contact damage multiplier
  radiusMul: number; // body + collider scale
  xpMul: number;
  goldMul: number;
}

export const ELITE_AFFIXES: readonly EliteAffix[] = [
  { id: 'swift', name: tr('迅捷', 'Swift'), color: '#ffd166', badge: 'chevron', hpMul: 1.8, speedMul: 1.65, dmgMul: 1.1, radiusMul: 1.15, xpMul: 4, goldMul: 4 },
  { id: 'mighty', name: tr('巨力', 'Mighty'), color: '#ff5252', badge: 'wedge', hpMul: 3.2, speedMul: 0.9, dmgMul: 1.6, radiusMul: 1.35, xpMul: 5, goldMul: 5 },
  { id: 'toxic', name: tr('剧毒', 'Toxic'), color: '#7be23a', badge: 'dots', hpMul: 2.2, speedMul: 1.1, dmgMul: 1.2, radiusMul: 1.2, xpMul: 4, goldMul: 4 },
];

/** Number of acid bolts a toxic elite releases on death. */
export const TOXIC_DEATH_BOLTS = 10;

export function rollEliteAffix(rng: () => number): EliteAffix {
  return ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)];
}
