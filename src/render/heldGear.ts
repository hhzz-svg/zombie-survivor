export interface HeldWeaponInput {
  spriteKey?: string;
  aimX: number;
  aimY: number;
  radius: number;
  recoil: number;
  bob: number;
}

export interface SpritePose {
  key: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  flipX: boolean;
  alpha: number;
}

export interface EquipmentVisualState {
  shield: number;
  charges: Map<string, number>;
  buffs: Map<string, number>;
  elapsed: number;
}

const CHARGE_ICON: Record<string, string> = {
  grenade: 'equip_grenade',
  heal: 'equip_medkit',
  berserk: 'equip_berserk',
};

const BUFF_ICON: Record<string, string> = {
  magnet: 'equip_magnet',
  boots: 'equip_boots',
  coinDouble: 'equip_coin_double',
  deathDance: 'equip_death_dance',
};

export function heldWeaponPose(input: HeldWeaponInput): SpritePose | null {
  if (!input.spriteKey) return null;
  const aimLen = Math.hypot(input.aimX, input.aimY) || 1;
  const ax = input.aimX / aimLen;
  const ay = input.aimY / aimLen;
  const flipX = ax < 0;
  const angle = Math.atan2(ay, ax);
  const rotation = flipX ? angle - Math.PI : angle;
  const hand = input.radius * 1.7;
  const pullBack = input.recoil * input.radius * 0.42;
  return {
    key: input.spriteKey,
    x: ax * (hand - pullBack),
    y: input.radius * 0.18 + ay * input.radius * 0.82 - input.bob * 0.35,
    size: input.radius * 3.75,
    rotation,
    flipX,
    alpha: 0.98,
  };
}

export function selectedEquipmentIconKeys(state: EquipmentVisualState): string[] {
  const keys: string[] = [];
  if (state.shield > 0) keys.push('equip_shield');
  for (const id of ['grenade', 'heal', 'berserk']) {
    if ((state.charges.get(id) ?? 0) > 0) keys.push(CHARGE_ICON[id]!);
  }
  for (const id of ['magnet', 'boots', 'coinDouble', 'deathDance']) {
    const until = state.buffs.get(id);
    if (until !== undefined && until > state.elapsed) keys.push(BUFF_ICON[id]!);
  }
  return keys.slice(0, 3);
}

export function carriedEquipmentPose(
  key: string,
  input: { facingLeft: boolean; radius: number; bob: number },
): SpritePose {
  const side = input.facingLeft ? 1 : -1;
  return {
    key,
    x: side * input.radius * 0.95,
    y: input.radius * 0.72 - input.bob * 0.25,
    size: Math.max(18, input.radius * 1.45),
    rotation: side * -0.18,
    flipX: input.facingLeft,
    alpha: 0.94,
  };
}
