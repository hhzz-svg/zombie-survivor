import type { GameContext } from './ctx';
import { EQUIPMENT, type EquipDef } from './data/equipment';
import { currentRunStage } from './data/balance';
import { availableSkillsForStage } from './data/skills';
import type { SkillDef } from './data/schemas';
import { buySkill } from './systems/skills';
import { startBuff } from './systems/equipment';

export type ShopOffer =
  | { type: 'equipment'; id: string; equipment: EquipDef }
  | { type: 'skill'; id: string; skill: SkillDef };

/**
 * The transaction itself — deducting gold and granting the thing. Lives here rather than in
 * the Game layer so the headless sim buys under exactly the same rules the player does;
 * a shop the balance harness cannot use is a shop the harness cannot measure.
 * Returns false (and changes nothing) when the purchase is not allowed.
 */
export function purchaseOffer(ctx: GameContext, offer: ShopOffer): boolean {
  if (offer.type === 'skill') return buySkill(ctx, offer.id);

  const def = EQUIPMENT.find((e) => e.id === offer.id);
  if (!def || ctx.equip.gold < def.cost) return false;
  ctx.equip.gold -= def.cost;
  switch (def.kind) {
    case 'charge':
      ctx.equip.charges.set(def.id, (ctx.equip.charges.get(def.id) ?? 0) + 1);
      break;
    case 'shield':
      ctx.equip.shield++;
      break;
    case 'buff':
      startBuff(ctx, def.id, def.duration ?? 30);
      break;
  }
  return true;
}

export function currentShopOffers(ctx: GameContext): ShopOffer[] {
  const stage = currentRunStage(ctx.time.elapsed);
  const offers: ShopOffer[] = EQUIPMENT.map((equipment) => ({
    type: 'equipment',
    id: equipment.id,
    equipment,
  }));

  const skillLimit = stage.index >= 4 ? 2 : stage.index >= 3 ? 1 : 0;
  if (skillLimit <= 0) return offers;

  for (const skill of availableSkillsForStage(stage.index, ctx.skills.owned).slice(0, skillLimit)) {
    offers.push({ type: 'skill', id: skill.id, skill });
  }
  return offers;
}
