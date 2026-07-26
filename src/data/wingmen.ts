/**
 * Wingmen: rescued survivors who fight alongside the player. A stranded
 * survivor appears on a cadence while the squad has room; reach them in time
 * and they join, follow, and fight until they fall.
 */

export interface WingmanDef {
  id: 'gunner' | 'burner' | 'medic';
  name: string;
  color: string; // squad ring + HUD chip color
  hp: number;
  cooldown: number; // seconds between actions
  range: number; // engage/heal radius (0 = self/player centered)
  damage: number; // base damage per shot (0 for medic)
  heal?: number; // medic: HP restored per pulse
}

export const WINGMEN: readonly WingmanDef[] = [
  { id: 'gunner', name: '机枪手', color: '#ffd166', hp: 85, cooldown: 0.17, range: 380, damage: 6 },
  { id: 'burner', name: '火焰兵', color: '#ff8a3c', hp: 85, cooldown: 0.55, range: 205, damage: 4.5 },
  { id: 'medic', name: '军医', color: '#6fef8f', hp: 70, cooldown: 4.5, range: 0, damage: 0, heal: 3 },
];

export function rollWingman(rng: () => number): WingmanDef {
  return WINGMEN[Math.floor(rng() * WINGMEN.length)]!;
}

export const MAX_SQUAD = 2;
export const SURVIVOR_FIRST_AT = 55;
export const SURVIVOR_INTERVAL = 75;
export const SURVIVOR_WAIT = 15; // seconds before a stranded survivor gives up
export const RESCUE_RADIUS = 42;

/** Wingman damage keeps loose pace with enemy HP growth over the run. */
export function wingmanDamage(def: WingmanDef, elapsed: number): number {
  return def.damage * (1 + elapsed / 240);
}
