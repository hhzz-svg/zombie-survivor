export interface CombatActorInput {
  weaponSprite?: string;
  aimX: number;
  aimY: number;
  radius: number;
  bob: number;
  recoil: number;
}

export interface CombatActorPose {
  key: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  flipX: boolean;
  muzzleX: number;
  muzzleY: number;
}

export type CombatMuzzleInput = Pick<CombatActorInput, 'aimX' | 'aimY' | 'radius' | 'bob' | 'recoil'>;

const FIREARM_KEYS: Record<string, string> = {
  pistol: 'player_pistol',
  shotgun: 'player_shotgun',
  smg: 'player_smg',
  magnum: 'player_magnum',
};

export function combatMuzzleOffset(input: CombatMuzzleInput): { x: number; y: number } {
  const length = Math.hypot(input.aimX, input.aimY) || 1;
  const ax = input.aimX / length;
  const ay = input.aimY / length;
  const side = ax < 0 ? -1 : 1;
  const pull = input.recoil * input.radius * 0.16;

  return {
    x: side * input.radius * 1.85 - ax * pull,
    y: -input.radius * 4.05 + ay * input.radius * 0.65 - input.bob,
  };
}

export function combatActorPose(input: CombatActorInput): CombatActorPose {
  const length = Math.hypot(input.aimX, input.aimY) || 1;
  const ax = input.aimX / length;
  const ay = input.aimY / length;
  const flipX = ax < 0;
  const side = flipX ? -1 : 1;
  const pull = input.recoil * input.radius * 0.16;
  const muzzle = combatMuzzleOffset(input);

  return {
    key: FIREARM_KEYS[input.weaponSprite ?? ''] ?? 'player_pistol',
    x: -ax * pull,
    y: -input.bob - ay * pull * 0.25,
    size: input.radius * 6.6,
    rotation: Math.max(-0.14, Math.min(0.14, ay * 0.14)) * side,
    flipX,
    muzzleX: muzzle.x,
    muzzleY: muzzle.y,
  };
}
