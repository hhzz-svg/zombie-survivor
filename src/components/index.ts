import { defineComponent } from '../ecs/world';
import type { Entity } from '../ecs/world';
import type { EnemyDef, WeaponDef } from '../data/schemas';

/** A weapon the player owns, with its current level and cooldown timer. */
export interface WeaponInst {
  def: WeaponDef;
  level: number;
  cd: number;
  phase?: number; // orbit angle accumulator
  hits?: Map<Entity, number>; // orbit: last-hit time per enemy (re-hit interval)
}

/** Per-enemy mutable state layered on top of its (shared, immutable) def. */
export interface EnemyRuntime {
  def: EnemyDef;
  t: number; // age in seconds
  shootCd: number; // spitter fire timer
  summonCd: number; // boss summon timer
  enraged: boolean; // boss phase-2 flag
}

export const Transform = defineComponent<{ x: number; y: number; rot: number }>('Transform');
export const Velocity = defineComponent<{ x: number; y: number }>('Velocity');
export const Health = defineComponent<{ hp: number; max: number; invuln: number; flash: number }>('Health');
export const Collider = defineComponent<{ r: number }>('Collider');
export const Renderable = defineComponent<{ shape: 'circle' | 'rect' | 'gem'; r: number; color: string }>(
  'Renderable',
);
export const PlayerTag = defineComponent<true>('PlayerTag');
export const Aim = defineComponent<{ x: number; y: number }>('Aim');
export const Loadout = defineComponent<{
  weapons: WeaponInst[];
  activeWeapon?: string;  // ID of the currently held aim weapon for player visuals
}>('Loadout');
export const Enemy = defineComponent<EnemyRuntime>('Enemy');
export const Bullet = defineComponent<{
  dmg: number;
  pierce: number;
  team: 'player' | 'enemy';
  knockback: number;
  crit: boolean;
  hit: Set<Entity>;
}>('Bullet');
export const Lifetime = defineComponent<{ t: number }>('Lifetime');
export const XPGem = defineComponent<{ value: number }>('XPGem');
export const GoldCoin = defineComponent<{ value: number }>('GoldCoin');
export const Medkit = defineComponent<{ heal: number }>('Medkit');
