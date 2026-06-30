/** Single source of truth for on-screen sprite size, so corpses/afterimages match live actors. */
export function enemySpriteSize(colliderR: number, isBoss: boolean): number {
  return colliderR * (isBoss ? 4.2 : 5.5);
}

export function playerSpriteSize(playerR: number): number {
  return playerR * 6.6;
}
