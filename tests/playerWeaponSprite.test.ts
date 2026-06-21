import { describe, it, expect } from 'vitest';
import { playerWeaponSpriteKey } from '../src/render/playerWeaponSprite';

describe('player weapon sprite selection', () => {
  it('uses one consistent character sprite for every weapon', () => {
    expect(playerWeaponSpriteKey('pistol')).toBe('player');
    expect(playerWeaponSpriteKey('shotgun')).toBe('player');
    expect(playerWeaponSpriteKey('smg')).toBe('player');
    expect(playerWeaponSpriteKey('magnum')).toBe('player');
  });

  it('keeps evolved weapons on the same character sprite', () => {
    expect(playerWeaponSpriteKey('pistol-evo')).toBe('player');
    expect(playerWeaponSpriteKey('shotgun-evo')).toBe('player');
  });
});
