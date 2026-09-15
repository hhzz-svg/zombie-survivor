import type { WeaponInst } from './components';

/**
 * The weapon the HUD names and the player sprite holds. Every weapon fires on its own
 * timer, so "primary" is presentation only: the explicitly selected one, else the first
 * aimed gun (orbits and novas have no barrel to point), else whatever is in slot 0.
 */
export function primaryWeapon(lo: { weapons: WeaponInst[]; activeWeapon?: string }): WeaponInst {
  return lo.weapons.find((wi) => wi.def.id === lo.activeWeapon)
    ?? lo.weapons.find((wi) => wi.def.kind === 'aim')
    ?? lo.weapons[0];
}
