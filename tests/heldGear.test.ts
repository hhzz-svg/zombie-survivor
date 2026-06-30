import { describe, expect, it } from 'vitest';
import { carriedEquipmentPose, heldWeaponPose, selectedEquipmentIconKeys } from '../src/render/heldGear';

describe('held gear pose', () => {
  it('aims the visible weapon from the player hand and pulls it back on recoil', () => {
    const ready = heldWeaponPose({ spriteKey: 'pistol', aimX: 1, aimY: 0, radius: 14, recoil: 0, bob: 0 });
    const kicked = heldWeaponPose({ spriteKey: 'pistol', aimX: 1, aimY: 0, radius: 14, recoil: 1, bob: 0 });

    expect(ready?.x).toBeGreaterThan(0);
    expect(ready?.rotation).toBeCloseTo(0);
    expect(kicked?.x).toBeLessThan(ready!.x);
  });

  it('mirrors left-facing weapon poses without losing the aim angle', () => {
    const pose = heldWeaponPose({ spriteKey: 'shotgun', aimX: -1, aimY: 0, radius: 14, recoil: 0, bob: 0 });

    expect(pose?.flipX).toBe(true);
    expect(pose?.rotation).toBeCloseTo(0);
    expect(pose?.x).toBeLessThan(0);
  });

  it('selects carried equipment by visible gameplay priority', () => {
    expect(selectedEquipmentIconKeys({
      shield: 1,
      charges: new Map([['grenade', 1], ['heal', 1]]),
      buffs: new Map(),
      elapsed: 10,
    })).toEqual(['equip_shield', 'equip_grenade', 'equip_medkit']);
  });

  it('places carried equipment on the off-hand side with a readable badge size', () => {
    const pose = carriedEquipmentPose('equip_shield', { facingLeft: false, radius: 14, bob: 2 });

    expect(pose.x).toBeLessThan(0);
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.size).toBeGreaterThanOrEqual(18);
  });
});
