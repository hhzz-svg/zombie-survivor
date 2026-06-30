import { describe, expect, it } from 'vitest';
import { combatActorPose } from '../src/render/combatActor';

const input = {
  weaponSprite: 'pistol',
  aimX: 1,
  aimY: 0,
  radius: 18,
  bob: 0,
  recoil: 0,
};

describe('combatActorPose', () => {
  it('selects a weapon-specific full-character sprite', () => {
    expect(combatActorPose({ ...input, weaponSprite: 'shotgun' }).key).toBe('player_shotgun');
  });

  it('mirrors the whole character instead of detaching the weapon', () => {
    const right = combatActorPose(input);
    const left = combatActorPose({ ...input, aimX: -1 });

    expect(right.flipX).toBe(false);
    expect(left.flipX).toBe(true);
    expect(left.muzzleX).toBeCloseTo(-right.muzzleX);
  });

  it('keeps vertical aim lean bounded so the actor never lies sideways', () => {
    const pose = combatActorPose({ ...input, weaponSprite: 'smg', aimX: 0.01, aimY: 1 });

    expect(Math.abs(pose.rotation)).toBeLessThanOrEqual(0.14);
  });

  it('places the muzzle on the raised weapon inside the full-character sprite', () => {
    const pose = combatActorPose(input);

    expect(pose.size).toBeGreaterThanOrEqual(input.radius * 6);
    expect(pose.muzzleY).toBeLessThan(-input.radius * 3);
  });

  it('moves the character and muzzle backward together during recoil', () => {
    const idle = combatActorPose({ ...input, weaponSprite: 'magnum' });
    const firing = combatActorPose({ ...input, weaponSprite: 'magnum', recoil: 1 });

    expect(firing.x).toBeLessThan(idle.x);
    expect(firing.muzzleX).toBeLessThan(idle.muzzleX);
  });
});
