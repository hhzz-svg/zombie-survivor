import { z } from 'zod';
import { WeaponDefSchema, type WeaponDef } from './schemas';

const raw = [
  { id: 'pistol',  name: '手枪',     kind: 'aim',  cooldown: 0.22, damage: 9,  projectiles: 1, speed: 660, pierce: 0, spread: 0,    range: 0,   knockback: 60,  life: 1.0, sprite: 'pistol' },
  { id: 'shotgun', name: '霰弹枪',   kind: 'aim',  cooldown: 0.92, damage: 7,  projectiles: 6, speed: 470, pierce: 0, spread: 0.55, range: 0,   knockback: 130, life: 0.42, sprite: 'shotgun' },
  { id: 'smg',     name: '冲锋枪',   kind: 'aim',  cooldown: 0.13, damage: 5,  projectiles: 1, speed: 620, pierce: 0, spread: 0.14, range: 0,   knockback: 18,  life: 0.85, sprite: 'smg' },
  { id: 'magnum',  name: '马格南',   kind: 'aim',  cooldown: 0.78, damage: 24, projectiles: 1, speed: 720, pierce: 2, spread: 0,    range: 0,   knockback: 160, life: 1.2, sprite: 'magnum' },
  { id: 'nova',    name: '冲击波',   kind: 'nova', cooldown: 2.1,  damage: 26, projectiles: 1, speed: 0,   pierce: 0, spread: 0,    range: 130, knockback: 220, life: 0.25, sprite: 'shockwave' },
  { id: 'orbit',   name: '环刃',     kind: 'orbit', cooldown: 0.4, damage: 12, projectiles: 3, speed: 2.6, pierce: 0, spread: 0,    range: 95,  knockback: 40,  life: 0.5, sprite: 'orbit_blade' },
  // Evolutions (unlocked at weapon Lv.6) — inherit parent sprite
  { id: 'pistol-evo',  name: '双持手枪', kind: 'aim',   cooldown: 0.18, damage: 11, projectiles: 2, speed: 720, pierce: 0, spread: 0.08, range: 0,   knockback: 70,  life: 1.1, sprite: 'pistol' },
  { id: 'shotgun-evo', name: '爆裂霰弹', kind: 'aim',   cooldown: 0.88, damage: 9,  projectiles: 7, speed: 490, pierce: 0, spread: 0.52, range: 0,   knockback: 150, life: 0.45, sprite: 'shotgun' },
  { id: 'smg-evo',     name: '激光冲锋', kind: 'aim',   cooldown: 0.11, damage: 6,  projectiles: 1, speed: 780, pierce: 3, spread: 0.08, range: 0,   knockback: 22,  life: 1.2, sprite: 'smg' },
  { id: 'magnum-evo',  name: '反器材步枪', kind: 'aim', cooldown: 0.72, damage: 52, projectiles: 1, speed: 850, pierce: 5, spread: 0,    range: 0,   knockback: 240, life: 1.4, sprite: 'magnum' },
  { id: 'nova-evo',    name: '雷暴新星', kind: 'nova',  cooldown: 1.9,  damage: 38, projectiles: 1, speed: 0,   pierce: 0, spread: 0,    range: 195, knockback: 280, life: 0.3, sprite: 'shockwave' },
  { id: 'orbit-evo',   name: '锯齿风暴', kind: 'orbit', cooldown: 0.35, damage: 16, projectiles: 5, speed: 3.9, pierce: 0, spread: 0,    range: 115, knockback: 55,  life: 0.5, sprite: 'orbit_blade' },
];

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(
  z.array(WeaponDefSchema).parse(raw).map((w) => [w.id, w] as const),
);

export const STARTER_WEAPON = 'pistol';
export const MAX_WEAPON_LEVEL = 6;

/** Maps base weapon ID to its evolution ID. */
export const EVOLUTIONS: Record<string, string> = {
  pistol: 'pistol-evo',
  shotgun: 'shotgun-evo',
  smg: 'smg-evo',
  magnum: 'magnum-evo',
  nova: 'nova-evo',
  orbit: 'orbit-evo',
};
