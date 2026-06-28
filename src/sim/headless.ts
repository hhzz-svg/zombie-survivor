import { World } from '../ecs/world';
import { makeRng } from '../ecs/rng';
import { SpatialHash } from '../ecs/spatialHash';
import { FX } from '../fx/fx';
import { AudioBus } from '../audio/audio';
import type { GameContext, PlayerStats, Director, TimeState, EquipmentState, SkillState } from '../ctx';
import { PLAYER_BASE, xpToNext } from '../data/balance';
import { createPlayer } from '../factory';
import { runSystems } from '../systems/pipeline';
import { makeChoices, applyChoice } from '../progression';
import { AiInput } from './aiInput';

export interface SimResult {
  survivedSec: number;
  kills: number;
  level: number;
  died: boolean;
  bossDead: boolean;
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

/**
 * Run a full match with no rendering at a fixed 60 Hz. This is the plan's highest-leverage tool:
 * it shares the EXACT systems with the live game, so it (a) catches runtime crashes in CI without a
 * browser and (b) yields balance metrics that the MCP `balance_sim` tool will surface to Claude.
 */
export function runHeadless(seed: number, maxSeconds: number): SimResult {
  const world = new World(makeRng(seed));
  const stats = freshStats();
  const time: TimeState = { elapsed: 0, hitStop: 0 };
  const director: Director = { budget: 0, bossSpawned: false, bossDead: false };
  const ai = new AiInput();
  let died = false;

  const ctx: GameContext = {
    world,
    player: 0,
    hash: new SpatialHash(40),
    fx: new FX(),
    audio: new AudioBus(),
    time,
    director,
    stats,
    equip: freshEquip(),
    skills: freshSkills(),
    input: ai,
    rng: world.rng,
    camera: { x: 0, y: 0 },
    screen: { shake: 0 },
    events: {
      onLevelUp: () => {
        const ch = makeChoices(ctx);
        if (ch.length > 0) applyChoice(ctx, ch[0]!);
      },
      onDeath: () => {
        died = true;
      },
      onVictory: () => {},
    },
  };
  ctx.player = createPlayer(ctx);
  ai.ctx = ctx;

  const STEP = 1 / 60;
  const maxSteps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < maxSteps; i++) {
    runSystems(ctx, STEP);
    if (died || director.bossDead) break;
  }

  return {
    survivedSec: time.elapsed,
    kills: stats.kills,
    level: stats.level,
    died,
    bossDead: director.bossDead,
  };
}
