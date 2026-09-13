import { World } from '../ecs/world';
import { makeRng } from '../ecs/rng';
import { SpatialHash } from '../ecs/spatialHash';
import { FX } from '../fx/fx';
import { AudioBus } from '../audio/audio';
import type { GameContext, PlayerStats, Director, TimeState, EquipmentState, SkillState } from '../ctx';
import { PLAYER_BASE, xpToNext, currentRunStage } from '../data/balance';
import { createPlayer } from '../factory';
import { runSystems } from '../systems/pipeline';
import { freshRunState } from '../systems/combo';
import { makeChoices, applyChoice, type Choice } from '../progression';
import { operativeById, applyOperative, applyOperativeLevel, DEFAULT_OPERATIVE } from '../data/operatives';
import { talentEffects, applyTalents, type TalentLevels } from '../data/talents';
import { currentShopOffers, purchaseOffer } from '../shop';
import { useItem } from '../systems/equipment';
import { useSkill, skillCooldownRemaining } from '../systems/skills';
import { Health, Loadout, Enemy, Transform } from '../components';
import { AiInput, DEFAULT_BOT, type BotTuning } from './aiInput';

/** How the scripted player picks its level-up rewards. */
export type ChoicePolicy = 'first' | 'greedy';

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
function pickChoice(choices: Choice[], policy: ChoicePolicy): Choice | undefined {
  if (policy === 'first' || choices.length === 0) return choices[0];
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
        const pick = pickChoice(makeChoices(ctx), policy);
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
    cause: died ? cause : '存活到时间上限',
  };
}
