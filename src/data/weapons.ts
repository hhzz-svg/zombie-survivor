import { z } from 'zod';
import { WeaponDefSchema, type WeaponDef } from './schemas';

const raw = [
  { id: 'pistol',  name: '手枪',     kind: 'aim',  cooldown: 0.22, damage: 9,  projectiles: 1, speed: 660, pierce: 0, spread: 0,    range: 0,   knockback: 60,  life: 1.0, sprite: 'pistol' },
  { id: 'shotgun', name: '霰弹枪',   kind: 'aim',  cooldown: 0.92, damage: 7,  projectiles: 6, speed: 470, pierce: 0, spread: 0.55, range: 0,   knockback: 130, life: 0.42, sprite: 'shotgun' },
  { id: 'smg',     name: '冲锋枪',   kind: 'aim',  cooldown: 0.13, damage: 5,  projectiles: 1, speed: 620, pierce: 0, spread: 0.14, range: 0,   knockback: 18,  life: 0.85, sprite: 'smg' },
  { id: 'magnum',  name: '马格南',   kind: 'aim',  cooldown: 0.78, damage: 24, projectiles: 1, speed: 720, pierce: 2, spread: 0,    range: 0,   knockback: 160, life: 1.2, sprite: 'magnum' },
  { id: 'nova',    name: '冲击波',   kind: 'nova', cooldown: 2.1,  damage: 26, projectiles: 1, speed: 0,   pierce: 0, spread: 0,    range: 130, knockback: 220, life: 0.25, sprite: 'shockwave' },
  { id: 'orbit',   name: '环刃',     kind: 'orbit', cooldown: 0.4, damage: 12, projectiles: 3, speed: 2.6, pierce: 0, spread: 0,    range: 95,  knockback: 40,  life: 0.5, sprite: 'orbit_blade' },
  { id: 'flamer',  name: '火焰喷射器', kind: 'aim', cooldown: 0.07, damage: 4, projectiles: 1, speed: 330, pierce: 1, spread: 0.34, range: 0,   knockback: 10,  life: 0.3, sprite: 'flamer', bulletStyle: 'flame' },
  { id: 'rocket',  name: '火箭筒',   kind: 'aim',  cooldown: 1.55, damage: 34, projectiles: 1, speed: 400, pierce: 0, spread: 0,    range: 0,   knockback: 200, life: 1.6, sprite: 'rocket', bulletStyle: 'rocket', explodeRadius: 95 },
  // Two weapons that are about WHERE you stand rather than how hard you hit. The beam wants a
  // clean line and is stopped by cover; the arc wants the horde bunched up. They pull in
  // opposite directions, which is the point — every other weapon here just sprays forward.
  { id: 'beam',    name: '光棱束',   kind: 'beam',  cooldown: 0.12, damage: 5,  projectiles: 1, speed: 0,   pierce: 0, spread: 0,    range: 420, knockback: 6,   life: 0.12, sprite: 'shockwave', width: 22 },
  { id: 'arc',     name: '链式电弧', kind: 'chain', cooldown: 0.85, damage: 16, projectiles: 4, speed: 0,   pierce: 0, spread: 0,    range: 260, knockback: 24,  life: 0.2, sprite: 'orbit_blade' },
  // Evolutions (unlocked at weapon Lv.6) — inherit parent sprite
  { id: 'pistol-evo',  name: '双持手枪', kind: 'aim',   cooldown: 0.18, damage: 11, projectiles: 2, speed: 720, pierce: 0, spread: 0.08, range: 0,   knockback: 70,  life: 1.1, sprite: 'pistol' },
  { id: 'shotgun-evo', name: '爆裂霰弹', kind: 'aim',   cooldown: 0.88, damage: 9,  projectiles: 7, speed: 490, pierce: 0, spread: 0.52, range: 0,   knockback: 150, life: 0.45, sprite: 'shotgun' },
  { id: 'smg-evo',     name: '激光冲锋', kind: 'aim',   cooldown: 0.11, damage: 6,  projectiles: 1, speed: 780, pierce: 3, spread: 0.08, range: 0,   knockback: 22,  life: 1.2, sprite: 'smg' },
  { id: 'magnum-evo',  name: '反器材步枪', kind: 'aim', cooldown: 0.72, damage: 52, projectiles: 1, speed: 850, pierce: 5, spread: 0,    range: 0,   knockback: 240, life: 1.4, sprite: 'magnum' },
  { id: 'nova-evo',    name: '雷暴新星', kind: 'nova',  cooldown: 1.9,  damage: 38, projectiles: 1, speed: 0,   pierce: 0, spread: 0,    range: 195, knockback: 280, life: 0.3, sprite: 'shockwave' },
  { id: 'orbit-evo',   name: '锯齿风暴', kind: 'orbit', cooldown: 0.35, damage: 16, projectiles: 5, speed: 3.9, pierce: 0, spread: 0,    range: 115, knockback: 55,  life: 0.5, sprite: 'orbit_blade' },
  { id: 'flamer-evo',  name: '地狱吐息', kind: 'aim',   cooldown: 0.055, damage: 6, projectiles: 2, speed: 385, pierce: 2, spread: 0.44, range: 0,  knockback: 14,  life: 0.34, sprite: 'flamer', bulletStyle: 'flame' },
  { id: 'rocket-evo',  name: '集束火箭', kind: 'aim',   cooldown: 1.35, damage: 42, projectiles: 2, speed: 430, pierce: 0, spread: 0.22, range: 0,  knockback: 230, life: 1.7, sprite: 'rocket', bulletStyle: 'rocket', explodeRadius: 115 },
  { id: 'beam-evo',    name: '裂界光刃', kind: 'beam',  cooldown: 0.1,  damage: 7,  projectiles: 3, speed: 0,   pierce: 0, spread: 0.5,  range: 520, knockback: 9,  life: 0.12, sprite: 'shockwave', width: 26 },
  { id: 'arc-evo',     name: '雷神之怒', kind: 'chain', cooldown: 0.72, damage: 21, projectiles: 7, speed: 0,   pierce: 0, spread: 0,    range: 320, knockback: 30, life: 0.2, sprite: 'orbit_blade' },
];

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(
  z.array(WeaponDefSchema).parse(raw).map((w) => [w.id, w] as const),
);

export const STARTER_WEAPON = 'pistol';
export const MAX_WEAPON_LEVEL = 6;

/**
 * Evolution recipes. A weapon evolves only at MAX_WEAPON_LEVEL *and* with the paired passive
 * at `passiveLevel` — so the mid-run goal is "I need multi-shot to Lv.3", not "it happened".
 */
export interface EvolutionRecipe {
  evo: string;
  passive: string; // passive id required
  passiveLevel: number;
}

export const EVOLUTIONS: Record<string, EvolutionRecipe> = {
  pistol:  { evo: 'pistol-evo',  passive: 'rof',   passiveLevel: 3 },
  shotgun: { evo: 'shotgun-evo', passive: 'multi', passiveLevel: 3 },
  smg:     { evo: 'smg-evo',     passive: 'ap',    passiveLevel: 3 },
  magnum:  { evo: 'magnum-evo',  passive: 'crit',  passiveLevel: 3 },
  nova:    { evo: 'nova-evo',    passive: 'pow',   passiveLevel: 3 },
  orbit:   { evo: 'orbit-evo',   passive: 'legs',  passiveLevel: 3 },
  flamer:  { evo: 'flamer-evo',  passive: 'vamp',  passiveLevel: 3 },
  rocket:  { evo: 'rocket-evo',  passive: 'vest',  passiveLevel: 3 },
  beam:    { evo: 'beam-evo',    passive: 'chill', passiveLevel: 3 },
  arc:     { evo: 'arc-evo',     passive: 'magnet', passiveLevel: 3 },
};

/** The recipe for a weapon, or undefined if it has none (evolved weapons never re-evolve). */
export function evolutionFor(weaponId: string): EvolutionRecipe | undefined {
  if (weaponId.endsWith('-evo')) return undefined;
  return EVOLUTIONS[weaponId];
}

/** True when this weapon is maxed AND its paired passive has reached the required level. */
export function evolutionReady(
  weaponId: string,
  weaponLevel: number,
  passives: ReadonlyMap<string, number>,
  discount = 0,
): boolean {
  const r = evolutionFor(weaponId);
  if (!r || weaponLevel < MAX_WEAPON_LEVEL) return false;
  return (passives.get(r.passive) ?? 0) >= requiredPassiveLevel(r, discount);
}

/** The recipe's passive requirement after the 改装工坊 talent shaves levels off it. */
export function requiredPassiveLevel(r: EvolutionRecipe, discount = 0): number {
  return Math.max(1, r.passiveLevel - discount);
}

/** Human-readable requirement line, e.g. "进化需求：多重射击 Lv.3（当前 Lv.1）". */
export function evolutionHint(
  weaponId: string,
  passives: ReadonlyMap<string, number>,
  passiveName: (id: string) => string,
  discount = 0,
): string {
  const r = evolutionFor(weaponId);
  if (!r) return '';
  const have = passives.get(r.passive) ?? 0;
  const need = requiredPassiveLevel(r, discount);
  return `进化需求：${passiveName(r.passive)} Lv.${need}（当前 Lv.${have}）`;
}
