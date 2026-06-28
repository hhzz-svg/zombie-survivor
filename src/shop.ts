import type { GameContext } from './ctx';
import { EQUIPMENT, type EquipDef } from './data/equipment';
import { currentRunStage } from './data/balance';
import { availableSkillsForStage } from './data/skills';
import type { SkillDef } from './data/schemas';

export type ShopOffer =
  | { type: 'equipment'; id: string; equipment: EquipDef }
  | { type: 'skill'; id: string; skill: SkillDef };

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
