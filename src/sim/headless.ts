import { World } from '../ecs/world';
import { makeRng } from '../ecs/rng';
import { SpatialHash } from '../ecs/spatialHash';
import { FX } from '../fx/fx';
import { AudioBus } from '../audio/audio';
import type { GameContext, PlayerStats, Director, TimeState, EquipmentState, SkillState } from '../ctx';
import { PLAYER_BASE, xpToNext, currentRunStage, rerollCost, banishCost } from '../data/balance';
import { createPlayer } from '../factory';
import { runSystems } from '../systems/pipeline';
import { freshRunState } from '../systems/combo';
import { makeChoices, applyChoice, choiceKey, type Choice } from '../progression';
import { evolutionFor, requiredPassiveLevel } from '../data/weapons';
import { operativeById, applyOperative, applyOperativeLevel, DEFAULT_OPERATIVE } from '../data/operatives';
import { talentEffects, applyTalents, type TalentLevels } from '../data/talents';
import { currentShopOffers, purchaseOffer } from '../shop';
import { useItem } from '../systems/equipment';
import { useSkill, skillCooldownRemaining } from '../systems/skills';
import { Health, Loadout, Enemy, Transform } from '../components';
import { AiInput, DEFAULT_BOT, type BotTuning } from './aiInput';

/**
 * How the scripted player picks its level-up rewards.
 *  - `first`   take whatever is in slot 1 (the original, kept so old numbers stay comparable)
 *  - `greedy`  a rough stand-in for an average player: upgrade whatever is upgradable
 *  - `focus`   plays deliberately toward one weapon's evolution, the way a player with a plan
 *              would. The gap between `greedy` and `focus` is what separates "the recipe is
 *              too expensive" from "the bot just never tried".
 */
export type ChoicePolicy = 'first' | 'greedy' | 'focus';

export interface SimOptions {
  operative?: string;
  /** Veterancy level to run at (1 = none), so meta progression can be measured too. */
  operativeLevel?: number;
  talents?: TalentLevels;
  policy?: ChoicePolicy;
  /** Let the bot spend gold in the shop and fire its skills. Default true. */
  shop?: boolean;
  /** Override the scripted player's steering weights (used to calibrate the bot itself). */
  bot?: Partial<BotTuning>;
}

export interface SimResult {
  seed: number;
  operative: string;
  survivedSec: number;
  kills: number;
  level: number;
  died: boolean;
  bossDead: boolean;
  stage: number;
  gold: number;
  elites: number;
  crates: number;
  maxCombo: number;
  evolved: boolean;
  tyrants: number;
  rescued: number;
  /** Final loadout as `id:level`, for weapon pick-rate and evolution-reach stats. */
  weapons: string[];
  passives: string[];
  /** Active skills bought this run — the only direct evidence the shop was used. */
  skills: string[];
  rerolls: number;
  banishes: number;
  cause: string;
}

function freshStats(): PlayerStats {
  return {
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    kills: 0,
    damageMul: 1,
    fireRateMul: 1,
    moveSpeed: PLAYER_BASE.moveSpeed,
    maxHp: PLAYER_BASE.maxHp,
    pierceBonus: 0,
    magnet: 0,
    projectileBonus: 0,
    crit: 0,
    lifesteal: 0,
    detonate: 0,
    chill: 0,
    desperate: 0,
    evoDiscount: 0,
  };
}

function freshEquip(): EquipmentState {
  return {
    gold: 0,
    charges: new Map<string, number>(),
    buffs: new Map<string, number>(),
    buffUndo: new Map<string, () => void>(),
    shield: 0,
    deathDanceStacks: 0,
  };
}

function freshSkills(): SkillState {
  return {
    owned: new Set<string>(),
    cooldowns: new Map<string, number>(),
    barrierUntil: 0,
    barrierLayers: 0,
    slowUntil: 0,
    dashUntil: 0,
  };
}

/** Rank the offer list the way a competent player roughly would. */
function pickChoice(ctx: GameContext, choices: Choice[], policy: ChoicePolicy): Choice | undefined {
  if (policy === 'first' || choices.length === 0) return choices[0];
  if (policy === 'focus') {
    const focused = pickFocused(ctx, choices);
    if (focused) return focused;
  }
  const rank = (c: Choice): number => {
    switch (c.kind) {
      case 'weapon-evo': return 0;
      case 'weapon-up': return 1;
      case 'passive-up': return 2;
      case 'weapon-new': return 3;
      case 'passive': return 4;
      default: return 5;
    }
  };
  return choices.slice().sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * Chase one weapon's evolution: keep the starting weapon, push it to max, and take the
 * passive its recipe needs. Everything else is filler.
 */
function onPlanChoice(ctx: GameContext, choices: Choice[]): Choice | undefined {
  const lo = ctx.world.get(ctx.player, Loadout);
  const target = lo?.weapons[0];
  if (!target) return undefined;

  const evo = choices.find((c) => c.kind === 'weapon-evo');
  if (evo) return evo;
  const up = choices.find((c) => c.kind === 'weapon-up' && c.weaponId === target.def.id);
  if (up) return up;

  const recipe = evolutionFor(target.def.id);
  if (!recipe) return undefined;
  const have = ctx.passives.get(recipe.passive) ?? 0;
  if (have >= requiredPassiveLevel(recipe, ctx.stats.evoDiscount)) return undefined;
  return choices.find(
    (c) => (c.kind === 'passive' && c.passive.id === recipe.passive)
      || (c.kind === 'passive-up' && c.passiveId === recipe.passive),
  );
}

function pickFocused(ctx: GameContext, choices: Choice[]): Choice | undefined {
  // Nothing on-plan was offered: never widen the weapon pool, which only dilutes future offers.
  return onPlanChoice(ctx, choices) ?? choices.find((c) => c.kind !== 'weapon-new');
}

/**
 * Spend gold to shape the offer, the way a player chasing an evolution would: banish the
 * cards that are dead weight to this plan (which narrows the pool for every future level-up),
 * then reroll while nothing on-plan is showing. Returns the final table.
 *
 * Only the `focus` policy does this, which makes greedy-vs-focus a clean before/after on the
 * feature itself rather than on playstyle alone.
 */
function shapeOffer(ctx: GameContext, initial: Choice[]): Choice[] {
  let choices = initial;
  const lo = ctx.world.get(ctx.player, Loadout);
  const targetId = lo?.weapons[0]?.def.id;
  const recipe = targetId ? evolutionFor(targetId) : undefined;
  const keepKeys = new Set([`w:${targetId}`, recipe ? `p:${recipe.passive}` : '']);

  for (let step = 0; step < 8; step++) {
    // Banish dead weight first — it pays off on every later level-up, not just this one.
    const bCost = banishCost(ctx.run.banishes);
    if (ctx.equip.gold >= bCost * 3) {
      const idx = choices.findIndex((c) => {
        const k = choiceKey(c);
        return k !== null && !keepKeys.has(k);
      });
      if (idx >= 0) {
        ctx.equip.gold -= bCost;
        ctx.run.banishes++;
        ctx.run.banished.add(choiceKey(choices[idx]!)!);
        choices = makeChoices(ctx, choices.filter((_, j) => j !== idx));
        continue;
      }
    }
    if (onPlanChoice(ctx, choices)) break;
    const rCost = rerollCost(ctx.run.rerolls);
    if (ctx.equip.gold < rCost) break;
    ctx.equip.gold -= rCost;
    ctx.run.rerolls++;
    choices = makeChoices(ctx);
  }
  return choices;
}

/**
 * Spend gold and fire skills. Deliberately simple and readable — it is a yardstick, not a
 * player — but it has to exist: a bot that never opens the shop cannot measure a game whose
 * whole economy is the shop.
 */
function botSpend(ctx: GameContext): void {
  const h = ctx.world.get(ctx.player, Health);
  if (!h) return;
  const hurt = h.hp / h.max < 0.5;
  const offers = currentShopOffers(ctx);
  const offer = (id: string) => offers.find((o) => o.id === id);

  if (hurt) {
    const heal = offer('heal');
    if (heal && purchaseOffer(ctx, heal)) useItem(ctx, 'KeyE');
  }
  if (ctx.equip.shield === 0 && ctx.equip.gold >= 60) {
    const shield = offer('shield');
    if (shield) purchaseOffer(ctx, shield);
  }
  if (currentRunStage(ctx.time.elapsed).index >= 3) {
    for (const o of offers) {
      if (o.type === 'skill' && purchaseOffer(ctx, o)) break;
    }
  }
  if (ctx.equip.gold >= 120) {
    const grenade = offer('grenade');
    if (grenade) purchaseOffer(ctx, grenade);
  }

  // Panic buttons, in order of how badly they are needed.
  const near = ctx.world.query(Enemy, Transform).length;
  if (hurt && skillCooldownRemaining(ctx, 'barrier') === 0) useSkill(ctx, 'KeyC');
  if (near > 60 && skillCooldownRemaining(ctx, 'slow') === 0) useSkill(ctx, 'KeyV');
  if (near > 40 && skillCooldownRemaining(ctx, 'burst') === 0) useSkill(ctx, 'KeyX');
  if (hurt && skillCooldownRemaining(ctx, 'dash') === 0) useSkill(ctx, 'KeyZ');
  if (hurt && (ctx.equip.charges.get('grenade') ?? 0) > 0) useItem(ctx, 'KeyQ');
}

/**
 * Run a full match with no rendering at a fixed 60 Hz. This shares the EXACT systems with the
 * live game, so it (a) catches runtime crashes in CI without a browser and (b) is the source
 * of the numbers `npm run balance` reports.
 */
export function runHeadless(seed: number, maxSeconds: number, opts: SimOptions = {}): SimResult {
  const world = new World(makeRng(seed));
  const op = operativeById(opts.operative ?? DEFAULT_OPERATIVE);
  const fx = talentEffects(opts.talents ?? {});
  const stats = applyTalents(
    applyOperativeLevel(applyOperative(freshStats(), op), op, opts.operativeLevel ?? 1),
    fx,
  );
  const time: TimeState = { elapsed: 0, hitStop: 0 };
  const director: Director = { budget: 0, bossSpawned: false, bossDead: false };
  const ai = new AiInput();
  ai.tuning = { ...DEFAULT_BOT, ...opts.bot };
  const policy = opts.policy ?? 'greedy';
  const useShop = opts.shop !== false;
  let died = false;
  let cause = '存活到时间上限';

  const ctx: GameContext = {
    world,
    player: 0,
    hash: new SpatialHash(40),
    fx: new FX(),
    audio: new AudioBus(),
    time,
    director,
    stats,
    passives: new Map<string, number>(),
    equip: { ...freshEquip(), gold: fx.startGold, shield: fx.startShield },
    skills: freshSkills(),
    run: { ...freshRunState(), adrenalineLeft: fx.adrenalineCharges, revivesLeft: fx.revives },
    input: ai,
    rng: world.rng,
    seed,
    camera: { x: 0, y: 0 },
    screen: { shake: 0 },
    events: {
      onLevelUp: () => {
        let choices = makeChoices(ctx);
        if (policy === 'focus' && useShop) choices = shapeOffer(ctx, choices);
        const pick = pickChoice(ctx, choices, policy);
        if (pick) applyChoice(ctx, pick);
      },
      onDeath: () => {
        died = true;
      },
      onVictory: () => {},
    },
    // Only the damage-cause hook does anything: it is how the report answers "what killed it".
    vfx: {
      onEnemyKilled: () => {},
      onEnemyKnocked: () => {},
      onBloodSplat: () => {},
      onPlayerHit: (c) => {
        cause = c;
      },
    },
  };
  ctx.player = createPlayer(ctx, op.weapon);
  ai.ctx = ctx;

  const STEP = 1 / 60;
  const maxSteps = Math.floor(maxSeconds / STEP);
  let sinceSpend = 0;
  for (let i = 0; i < maxSteps; i++) {
    runSystems(ctx, STEP);
    if (useShop) {
      sinceSpend += STEP;
      if (sinceSpend >= 1.5) {
        sinceSpend = 0;
        botSpend(ctx);
      }
    }
    if (died || director.bossDead) break;
  }

  const lo = world.get(ctx.player, Loadout);
  return {
    seed,
    operative: op.id,
    survivedSec: time.elapsed,
    kills: stats.kills,
    level: stats.level,
    died,
    bossDead: director.bossDead,
    stage: currentRunStage(time.elapsed).index,
    gold: ctx.equip.gold,
    elites: ctx.run.elitesKilled,
    crates: ctx.run.cratesOpened,
    maxCombo: ctx.run.combo.best,
    evolved: ctx.run.evolved,
    tyrants: ctx.run.tyrantsSlain,
    rescued: ctx.run.rescued,
    weapons: (lo?.weapons ?? []).map((w) => `${w.def.id}:${w.level}`),
    passives: [...ctx.passives].map(([id, lv]) => `${id}:${lv}`),
    skills: [...ctx.skills.owned],
    rerolls: ctx.run.rerolls,
    banishes: ctx.run.banishes,
    cause: died ? cause : '存活到时间上限',
  };
}
