import type { World, Entity } from './ecs/world';
import type { SpatialHash } from './ecs/spatialHash';
import type { FX } from './fx/fx';
import type { AudioBus } from './audio/audio';
import type { InputProvider } from './input/provider';
import type { Camera } from './render/renderer';

/** Aggregate player progression + derived combat modifiers (a single-instance "resource"). */
export interface PlayerStats {
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  // derived modifiers (recomputed from base + picked passives)
  damageMul: number;
  fireRateMul: number;
  moveSpeed: number;
  maxHp: number;
  pierceBonus: number;
  magnet: number; // multiplier on pickup range
  projectileBonus: number;
  evoDiscount: number; // passive levels shaved off every evolution recipe (改装工坊)
  crit: number; // crit chance 0..1 (crit = 2× damage)
  lifesteal: number; // hp restored per kill
  // Trait passives — behaviour, not raw numbers. Each level adds one step.
  detonate: number; // chance a kill detonates the corpse (0..1)
  chill: number; // slow fraction applied to enemies on hit (0..1)
  desperate: number; // bonus damage multiplier while below DESPERATE_HP_FRAC
}

export interface TimeState {
  elapsed: number; // seconds survived this run
  hitStop: number; // ms of remaining freeze for impact feel
}

/** Kill-combo chain: kills within the decay window stack; tiers boost XP/gold. */
export interface ComboState {
  count: number;
  best: number;
  until: number; // elapsed time at which the chain breaks
}

/** Per-run tallies surfaced on the HUD and the end-of-run summary. */
export interface RunState {
  combo: ComboState;
  elitesKilled: number;
  cratesOpened: number;
  tyrantsSlain: number; // endless-mode extra boss kills
  goldenKilled: number; // golden runners caught this run
  evolved: boolean; // any weapon evolved this run
  firstHpHitAt: number | null; // elapsed time of the first real HP hit (null = untouched)
  adrenalineLeft: number; // remaining low-HP saves (the 第二次呼吸 talent grants a second)
  revivesLeft: number; // remaining death saves from the 复活协议 talent
  curse: number; // blood-curse altar stacks accepted this run
  rescued: number; // survivors rescued into the squad this run
  rerolls: number; // level-up rerolls bought this run (each one costs more)
  banishes: number; // cards banished this run (each one costs much more)
  /** Pool keys removed for the rest of the run — see `choiceKey`. */
  banished: Set<string>;
}

export interface Director {
  budget: number;
  bossSpawned: boolean;
  bossDead: boolean;
  bossWarningAt?: number;
  stageIndex?: number;
  stageBannerUntil?: number;
  nextDropAt?: number; // next supply-drop time (lazily initialised by the supply system)
  nextGoldenAt?: number; // next golden-runner spawn time
  nextSurvivorAt?: number; // next stranded-survivor spawn time
  activatedCells?: Set<string>; // obstacle cells whose barrels have already been materialised
  endless?: boolean; // post-victory endless mode
  bossId?: string; // which boss this run drew — the fight survives the boss entity's death
  bossCycle?: number; // endless: how many tyrants have spawned so far
  nextBossAt?: number; // endless: next tyrant respawn time
}

export interface GameEvents {
  onLevelUp: () => void;
  onDeath: () => void;
  onVictory: () => void;
}

/**
 * Persistent equipment state. Everything is a one-shot consumable now:
 *  - `charges`: remaining uses of charge items (grenade/heal/berserk), keyed by item id.
 *  - `buffs`: active timed buffs keyed by item id → ctx.time.elapsed at which they expire.
 *  - `buffUndo`: how to revert each active buff's stat deltas when it expires (applied once,
 *    reverted once — no fragile per-frame edge detection).
 *  - `shield`: stacking "block the next hit" charges.
 *  - `deathDanceStacks`: kill-stacks accrued during an active death-dance buff.
 */
export interface EquipmentState {
  gold: number;
  charges: Map<string, number>;
  buffs: Map<string, number>;
  buffUndo: Map<string, () => void>;
  shield: number;
  deathDanceStacks: number;
}

export interface SkillState {
  owned: Set<string>;
  cooldowns: Map<string, number>;
  barrierUntil: number;
  barrierLayers: number;
  slowUntil: number;
  dashUntil: number;
}

/**
 * Optional visual-only hooks. The live game supplies these to spawn corpses/afterimages that
 * need sprites; the headless sim leaves them undefined so it never depends on rendering.
 */
export interface VfxHooks {
  onEnemyKilled: (x: number, y: number, key: string, r: number, isBoss: boolean, flipX: boolean) => void;
  onEnemyKnocked: (x: number, y: number, key: string, r: number, isBoss: boolean, flipX: boolean) => void;
  onBloodSplat: (x: number, y: number, r: number) => void;
  onPlayerHit?: (cause: string) => void;
  onSupplyReward?: (name: string, desc: string) => void;
  /** Center-screen announcements: curse pacts, achievements, adrenaline. */
  onAnnounce?: (name: string, desc: string, kind: 'curse' | 'achieve' | 'adrenaline') => void;
}

/** Everything a system needs, passed explicitly (no globals) so the sim can construct its own. */
export interface GameContext {
  world: World;
  player: Entity;
  hash: SpatialHash;
  fx: FX;
  audio: AudioBus;
  time: TimeState;
  director: Director;
  stats: PlayerStats;
  /** Owned passives → current level. Drives the level-up pool, evolutions and the HUD. */
  passives: Map<string, number>;
  input: InputProvider;
  rng: () => number;
  /** The run's world seed. Drives the obstacle field, and is what a shared/daily run would pin. */
  seed: number;
  camera: Camera;
  screen: { shake: number }; // current screen-shake magnitude, decayed by the camera each frame
  events: GameEvents;
  equip: EquipmentState;
  skills: SkillState;
  run: RunState;
  vfx?: VfxHooks; // optional; present only in the live game
}
