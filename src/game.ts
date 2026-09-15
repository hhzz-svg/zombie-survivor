import { World } from './ecs/world';
import { makeRng } from './ecs/rng';
import { SpatialHash } from './ecs/spatialHash';
import { FX } from './fx/fx';
import { AudioBus } from './audio/audio';
import type { Renderer } from './render/renderer';
import { WorldRenderer } from './render/worldRenderer';
import { Input } from './input/input';
import { DomInput } from './input/provider';
import type { GameContext, PlayerStats, EquipmentState, SkillState } from './ctx';
import {
  PLAYER_BASE, currentRunStage, xpToNext, ENDLESS_BOSS_INTERVAL, rerollCost, banishCost,
} from './data/balance';
import { EQUIPMENT } from './data/equipment';
import { SKILLS } from './data/skills';
import {
  OPERATIVES, DEFAULT_OPERATIVE, operativeById, applyOperative,
  applyOperativeLevel, opLevelFromXp, opXpGain, opLevelBonusText,
} from './data/operatives';
import { ACHIEVEMENTS, evaluateAchievements, type AchieveSnapshot, type AchievementDef } from './data/achievements';
import { createPlayer } from './factory';
import { runSystems } from './systems/pipeline';
import { useItem } from './systems/equipment';
import { skillCooldownRemaining, useSkill } from './systems/skills';
import { freshRunState } from './systems/combo';
import { Transform, Enemy, Loadout, Wingman } from './components';
import { makeChoices, applyChoice, choiceKey, type Choice } from './progression';
import { UI, type RunSummary } from './ui/ui';
import { buildHudData, passiveList } from './ui/hudData';
import { primaryWeapon } from './loadout';
import { currentShopOffers, purchaseOffer, type ShopOffer } from './shop';
import type { Settings } from './settings';
import { loadSave, writeSave, SAVE_VERSION } from './save';
import {
  NO_TALENTS, talentEffects, applyTalents, salvageGain, buyState, nextCost, totalSpent, talentById,
} from './data/talents';
import { dailyKey, dailySeed, formatSeed, parseSeed, randomSeed } from './seed';
import { tr } from './i18n';

type State = 'title' | 'playing' | 'paused' | 'levelup' | 'shop' | 'gameover' | 'victory';

interface LifetimeStats {
  kills: number;
  runs: number;
  wins: number;
}

/** Orchestrates the run: state machine, system pipeline, world rendering, and the UI screens. */
export class Game {
  private readonly keys = new Input();
  private readonly ui = new UI();
  private readonly audio = new AudioBus();
  private readonly fx = new FX();
  private readonly hash = new SpatialHash(40);
  private readonly world: WorldRenderer;
  private ctx: GameContext | null = null;
  private state: State = 'title';
  private pendingLevels = 0;
  private choices: Choice[] = [];
  private best: number;
  private settings: Settings;
  private runSeed = 0;
  private runDailyKey: string | null = null; // set when this run IS today's daily
  private settingsBack: (() => void) | null = null; // non-null while the settings panel is open
  private dailyRecords: Record<string, { time: number; kills: number }>;
  private salvage: number; // unspent meta currency
  private talents: Record<string, number>; // talent id → owned level
  private salvageCommitted = 0; // already banked for the run in progress
  private lastSalvageGain = 0;
  private lastDamageCause = tr('尚未受到致命伤害', 'No fatal damage taken yet');
  private lastOperative: string;
  private unlockedAch: Set<string>;
  private lifetime: LifetimeStats;
  private opXp: Record<string, number>; // per-operative accumulated veterancy XP
  private opXpCommitted = 0; // XP already banked for the current run
  private lastOpProgress: { name: string; level: number; gained: number; leveledUp: boolean } | null = null;
  private runAchievements: AchievementDef[] = []; // unlocked during the current run
  private nextAchCheck = 0; // throttle for live achievement evaluation
  // A run can "end" twice (victory screen → endless → death), so lifetime
  // totals commit incrementally: kills as a delta, runs/wins exactly once.
  private killsCommitted = 0;
  private runCounted = false;
  private winCounted = false;

  constructor(private readonly renderer: Renderer) {
    this.world = new WorldRenderer(renderer);
    // One read of one versioned, validated profile — see save.ts for why it is not nine keys.
    const save = loadSave();
    this.best = save.best;
    this.lastOperative = save.operative || DEFAULT_OPERATIVE;
    this.unlockedAch = new Set(save.achievements);
    this.lifetime = { ...save.lifetime };
    this.opXp = { ...save.operativeXp };
    this.dailyRecords = { ...save.daily };
    this.salvage = save.salvage;
    this.talents = { ...save.talents };
    this.settings = save.settings;
    this.applySettings();
    void this.world.loadAssets();
    this.showTitle();
    this.ui.setShopHandler(() => this.openShop());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /**
   * Write the whole profile. Everything that used to touch localStorage directly now goes
   * through here, so there is exactly one place that knows the on-disk shape.
   */
  private persist(): void {
    writeSave({
      version: SAVE_VERSION,
      best: this.best,
      operative: this.lastOperative,
      achievements: [...this.unlockedAch],
      lifetime: this.lifetime,
      operativeXp: this.opXp,
      daily: this.dailyRecords,
      salvage: this.salvage,
      talents: this.talents,
      settings: this.settings,
    });
  }

  private showTitle(): void {
    const progress: Record<string, { level: number; into: number; next: number; bonus: string }> = {};
    for (const op of OPERATIVES) {
      const lv = opLevelFromXp(this.opXp[op.id] ?? 0);
      progress[op.id] = { ...lv, bonus: opLevelBonusText(op, lv.level) };
    }
    const key = dailyKey();
    this.ui.showTitle({
      best: this.best,
      operatives: OPERATIVES,
      selectedId: this.lastOperative,
      progress,
      ach: { unlocked: this.unlockedAch.size, total: ACHIEVEMENTS.length },
      daily: { key, seed: formatSeed(dailySeed(key)), best: this.dailyRecords[key] ?? null },
      salvage: this.salvage,
      onShowTalents: () => this.openTalents(),
      onStart: (id, seed) => this.start(id, seed),
      onShowAchievements: () => this.ui.showAchievements(ACHIEVEMENTS, this.unlockedAch, () => this.showTitle()),
      onShowSettings: () => this.openSettings(() => this.showTitle()),
      parseSeed,
    });
  }

  /** The talent tree. Buying and refunding both re-render it in place. */
  private openTalents(): void {
    this.ui.showTalents(
      this.talents,
      this.salvage,
      this.unlockedAch,
      (id) => this.buyTalent(id),
      () => this.refundTalents(),
      () => this.showTitle(),
    );
  }

  private buyTalent(id: string): void {
    const def = talentById(id);
    if (!def) return;
    // Re-check here rather than trusting the click: the UI is a view, not the authority.
    if (buyState(def, this.talents, this.salvage, this.unlockedAch).kind !== 'ok') return;
    const cost = nextCost(def, this.talents)!;
    this.salvage -= cost;
    this.talents[id] = (this.talents[id] ?? 0) + 1;
    this.saveMeta();
    this.audio.resume();
    this.audio.levelUp();
    this.openTalents();
  }

  /** Full refund, no penalty — a build you can't undo is a build nobody experiments with. */
  private refundTalents(): void {
    this.salvage += totalSpent(this.talents);
    this.talents = {};
    this.saveMeta();
    this.openTalents();
  }

  /** Settings are live: every change applies and persists immediately, then `back` returns. */
  private openSettings(back: () => void): void {
    this.settingsBack = () => {
      this.settingsBack = null;
      back();
    };
    this.ui.showSettings(
      this.settings,
      (next) => {
        this.settings = next;
        this.applySettings();
        this.persist();
      },
      () => this.settingsBack?.(),
    );
  }

  private applySettings(): void {
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.fx.showNumbers = this.settings.damageNumbers;
  }

  /** Owned talents, resolved and folded into the run's opening stats. */
  private freshStats(): PlayerStats {
    return {
      level: 1, xp: 0, xpToNext: xpToNext(1), kills: 0,
      damageMul: 1, fireRateMul: 1, moveSpeed: PLAYER_BASE.moveSpeed, maxHp: PLAYER_BASE.maxHp,
      pierceBonus: 0, magnet: 0, projectileBonus: 0, crit: 0, lifesteal: 0,
      detonate: 0, chill: 0, desperate: 0, evoDiscount: 0,
    };
  }

  private freshEquip(): EquipmentState {
    return {
      gold: 0,
      charges: new Map<string, number>(),
      buffs: new Map<string, number>(),
      buffUndo: new Map<string, () => void>(),
      shield: 0,
      deathDanceStacks: 0,
    };
  }

  private freshSkills(): SkillState {
    return {
      owned: new Set<string>(),
      cooldowns: new Map<string, number>(),
      barrierUntil: 0,
      barrierLayers: 0,
      slowUntil: 0,
      dashUntil: 0,
    };
  }

  start(operativeId?: string, seedOverride?: number): void {
    const op = operativeById(operativeId ?? this.lastOperative);
    this.lastOperative = op.id;
    this.persist();
    this.audio.resume();
    this.fx.clear();
    this.world.resetRun();
    this.hash.clear();
    this.lastDamageCause = tr('尚未受到致命伤害', 'No fatal damage taken yet');
    const seed = seedOverride ?? randomSeed();
    this.runSeed = seed;
    this.runDailyKey = seed === dailySeed(dailyKey()) ? dailyKey() : null;
    this.salvageCommitted = 0;
    // The daily is a fair fight: everyone gets the same world AND the same character, so
    // permanent power (talents and veterancy) is switched off for it. Otherwise the day's
    // leaderboard would just rank how long people have been grinding.
    const fair = this.runDailyKey !== null;
    const talents = fair ? NO_TALENTS : talentEffects(this.talents);
    const world = new World(makeRng(seed));
    const ctx: GameContext = {
      world,
      player: 0,
      hash: this.hash,
      fx: this.fx,
      audio: this.audio,
      time: { elapsed: 0, hitStop: 0 },
      director: { budget: 0, bossSpawned: false, bossDead: false },
      stats: applyTalents(
        applyOperativeLevel(
          applyOperative(this.freshStats(), op),
          op,
          fair ? 1 : opLevelFromXp(this.opXp[op.id] ?? 0).level,
        ),
        talents,
      ),
      passives: new Map<string, number>(),
      equip: { ...this.freshEquip(), gold: talents.startGold, shield: talents.startShield },
      skills: this.freshSkills(),
      run: { ...freshRunState(), adrenalineLeft: talents.adrenalineCharges, revivesLeft: talents.revives },
      input: new DomInput(this.keys, this.renderer),
      rng: world.rng,
      seed,
      camera: { x: 0, y: 0 },
      screen: { shake: 0 },
      events: {
        onLevelUp: () => {
          this.pendingLevels++;
        },
        onDeath: () => this.die(),
        onVictory: () => this.win(),
      },
      vfx: {
        onEnemyKilled: (x, y, key, r, isBoss, flipX) => this.world.spawnCorpse(x, y, key, r, isBoss, flipX),
        onEnemyKnocked: (x, y, key, r, isBoss, flipX) => this.world.spawnAfterimage(x, y, key, r, isBoss, flipX),
        onBloodSplat: (x, y, r) => this.world.splatBlood(x, y, r),
        onPlayerHit: (cause) => {
          this.lastDamageCause = cause;
        },
        onSupplyReward: (name, desc) => this.ui.reveal(name, desc),
        onAnnounce: (name, desc, kind) => this.ui.toast(name, desc, kind),
      },
    };
    ctx.player = createPlayer(ctx, op.weapon);
    this.ctx = ctx;
    this.pendingLevels = 0;
    this.runAchievements = [];
    this.nextAchCheck = 0;
    this.killsCommitted = 0;
    this.runCounted = false;
    this.winCounted = false;
    this.opXpCommitted = 0;
    this.lastOpProgress = null;
    this.state = 'playing';
    this.ui.hideTitle();
    this.ui.hideEnd();
    this.ui.hideLevelUp();
    this.ui.hideShop();
  }

  update(dt: number): void {
    if (this.state !== 'playing' || !this.ctx) return;
    const time = this.ctx.time;
    if (time.hitStop > 0) {
      time.hitStop -= dt * 1000;
      if (time.hitStop > 0) return; // freeze frame for impact
    }
    runSystems(this.ctx, dt);
    this.world.update(dt);
    this.audio.setIntensity(Math.min(1, this.ctx.world.query(Enemy).length / 120));

    // Handle just-pressed keys for items (during playing state)
    this.handleItemKeys();
    this.handleSkillKeys();
    this.keys.flush();

    // Live achievement checks, throttled — win or lose, every run makes progress.
    if (this.ctx.time.elapsed >= this.nextAchCheck) {
      this.nextAchCheck = this.ctx.time.elapsed + 0.75;
      this.checkAchievements(false);
    }

    if (this.state === 'playing' && this.pendingLevels > 0) this.enterLevelUp();
  }

  private achieveSnapshot(victory: boolean): AchieveSnapshot {
    const ctx = this.ctx!;
    return {
      time: ctx.time.elapsed,
      kills: ctx.stats.kills,
      maxCombo: ctx.run.combo.best,
      elites: ctx.run.elitesKilled,
      crates: ctx.run.cratesOpened,
      golden: ctx.run.goldenKilled,
      tyrants: ctx.run.tyrantsSlain,
      stage: currentRunStage(ctx.time.elapsed).index,
      gold: ctx.equip.gold,
      victory: victory || ctx.director.bossDead || ctx.run.tyrantsSlain > 0,
      evolved: ctx.run.evolved,
      curse: ctx.run.curse,
      firstHpHitAt: ctx.run.firstHpHitAt,
      rescued: ctx.run.rescued,
      squadNow: ctx.world.query(Wingman).length,
      // live totals include the run in progress so lifetime goals can pop mid-run
      totalKills: this.lifetime.kills + (ctx.stats.kills - this.killsCommitted),
      totalRuns: this.lifetime.runs + (this.runCounted ? 0 : 1),
      totalWins: this.lifetime.wins,
    };
  }

  private checkAchievements(victory: boolean): void {
    if (!this.ctx) return;
    const fresh = evaluateAchievements(this.achieveSnapshot(victory), this.unlockedAch);
    if (fresh.length === 0) return;
    for (const a of fresh) {
      this.unlockedAch.add(a.id);
      this.runAchievements.push(a);
      this.ui.toast(tr(`成就解锁 · ${a.name}`, `Achievement · ${a.name}`), a.desc, 'achieve');
      const pt = this.ctx.world.get(this.ctx.player, Transform);
      if (pt) this.ctx.fx.text(pt.x, pt.y - 46, tr(`成就 · ${a.name}`, `Achievement · ${a.name}`), '#61e5de', 15);
    }
    this.ctx.audio.levelUp();
    this.persist();
  }

  /** Fold run progress into lifetime totals (safe to call at each end screen). */
  private commitLifetime(victory: boolean): void {
    if (!this.ctx) return;
    this.checkAchievements(victory); // run-level goals at their final values
    this.lifetime.kills += this.ctx.stats.kills - this.killsCommitted;
    this.killsCommitted = this.ctx.stats.kills;
    if (!this.runCounted) {
      this.lifetime.runs += 1;
      this.runCounted = true;
    }
    if (victory && !this.winCounted) {
      this.lifetime.wins += 1;
      this.winCounted = true;
    }
    this.persist();
    this.checkAchievements(victory); // lifetime goals with the committed totals

    // Operative veterancy: bank the run's XP as a delta (endless can end twice).
    const op = operativeById(this.lastOperative);
    const before = opLevelFromXp(this.opXp[op.id] ?? 0).level;
    const gainTotal = opXpGain({
      kills: this.ctx.stats.kills,
      time: this.ctx.time.elapsed,
      victory: this.winCounted,
      elites: this.ctx.run.elitesKilled,
      tyrants: this.ctx.run.tyrantsSlain,
    });
    const delta = Math.max(0, gainTotal - this.opXpCommitted);
    this.opXpCommitted = gainTotal;
    this.opXp[op.id] = (this.opXp[op.id] ?? 0) + delta;
    this.persist();
    const after = opLevelFromXp(this.opXp[op.id]).level;
    this.lastOpProgress = { name: op.name, level: after, gained: gainTotal, leveledUp: after > before };
  }

  private handleItemKeys(): void {
    if (!this.ctx || this.state !== 'playing') return;
    const eq = this.ctx.equip;
    const chargeItems = EQUIPMENT.filter(
      (e) => e.kind === 'charge' && e.key && (eq.charges.get(e.id) ?? 0) > 0,
    );
    for (const item of chargeItems) {
      if (this.keys.justPressed(item.key!)) {
        const used = useItem(this.ctx, item.key!);
        if (used) {
          this.ctx.audio.pickup();
          this.ctx.screen.shake = Math.max(this.ctx.screen.shake, 4);
        }
      }
    }
  }

  private handleSkillKeys(): void {
    if (!this.ctx || this.state !== 'playing') return;
    for (const skill of SKILLS) {
      if (this.keys.justPressed(skill.key) && useSkill(this.ctx, skill.key)) {
        this.ctx.screen.shake = Math.max(this.ctx.screen.shake, 3);
      }
    }
  }

  private enterLevelUp(): void {
    if (!this.ctx) return;
    this.state = 'levelup';
    this.choices = makeChoices(this.ctx);
    this.renderLevelUp();
  }

  /** Re-render the current offer. Reroll and banish both come back through here. */
  private renderLevelUp(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ui.showLevelUp(
      this.choices,
      {
        gold: ctx.equip.gold,
        rerollCost: rerollCost(ctx.run.rerolls),
        banishCost: banishCost(ctx.run.banishes),
        onReroll: () => this.reroll(),
        onBanish: (i) => this.banish(i),
      },
      (i) => this.pick(i),
    );
  }

  /** Pay to redraw the whole table. */
  private reroll(): void {
    const ctx = this.ctx;
    if (this.state !== 'levelup' || !ctx) return;
    const cost = rerollCost(ctx.run.rerolls);
    if (ctx.equip.gold < cost) return;
    ctx.equip.gold -= cost;
    ctx.run.rerolls++;
    this.choices = makeChoices(ctx);
    this.audio.pickup();
    this.renderLevelUp();
  }

  /**
   * Pay to remove one card's subject from the rest of the run, then refill just that slot —
   * the other two stay, so a banish is never a cheaper reroll.
   */
  private banish(i: number): void {
    const ctx = this.ctx;
    if (this.state !== 'levelup' || !ctx) return;
    const target = this.choices[i];
    const key = target ? choiceKey(target) : null;
    if (!key) return;
    const cost = banishCost(ctx.run.banishes);
    if (ctx.equip.gold < cost) return;
    ctx.equip.gold -= cost;
    ctx.run.banishes++;
    ctx.run.banished.add(key);
    this.choices = makeChoices(ctx, this.choices.filter((_, j) => j !== i));
    this.audio.pickup();
    ctx.screen.shake = Math.max(ctx.screen.shake, 3);
    this.renderLevelUp();
  }

  private pick(i: number): void {
    if (this.state !== 'levelup' || !this.ctx) return;
    const c = this.choices[i];
    if (!c) return;
    applyChoice(this.ctx, c);
    this.audio.levelUp();
    this.pendingLevels--;
    if (this.pendingLevels > 0) {
      this.choices = makeChoices(this.ctx);
      this.renderLevelUp();
    } else {
      this.ui.hideLevelUp();
      this.state = 'playing';
    }
  }

  private openShop(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    this.state = 'shop';
    this.renderShop();
  }

  private renderShop(): void {
    if (!this.ctx) return;
    const eq = this.ctx.equip;
    const offers = currentShopOffers(this.ctx);
    // Per-item "currently held" status line for the shop cards.
    const status = (id: string): string => {
      // Skill offers carry ids that are not in EQUIPMENT, so resolve them first.
      const skill = SKILLS.find((s) => s.id === id);
      if (skill) {
        if (!this.ctx!.skills.owned.has(id)) return '';
        const remain = skillCooldownRemaining(this.ctx!, id);
        return remain > 0 ? tr(`冷却 ${Math.ceil(remain)}s`, `Cooldown ${Math.ceil(remain)}s`) : tr('已解锁', 'Owned');
      }
      const def = EQUIPMENT.find((e) => e.id === id);
      if (!def) return '';
      if (def.kind === 'charge') {
        const n = eq.charges.get(id) ?? 0;
        return n > 0 ? tr(`持有 ×${n}`, `Held ×${n}`) : '';
      }
      if (def.kind === 'shield') {
        return eq.shield > 0 ? tr(`护盾 ×${eq.shield}`, `Shield ×${eq.shield}`) : '';
      }
      const until = eq.buffs.get(id);
      if (until !== undefined && this.ctx!.time.elapsed < until) {
        return tr(`生效中 ${Math.ceil(until - this.ctx!.time.elapsed)}s`, `Active ${Math.ceil(until - this.ctx!.time.elapsed)}s`);
      }
      return '';
    };
    this.ui.showShop(
      eq.gold,
      offers,
      status,
      (offer: ShopOffer) => this.buyOffer(offer),
      () => this.closeShop(),
    );
  }

  private buyOffer(offer: ShopOffer): boolean {
    if (!this.ctx) return false;
    if (!purchaseOffer(this.ctx, offer)) return false;
    this.audio.levelUp();
    this.ctx.screen.shake = Math.max(this.ctx.screen.shake, 4);
    this.renderShop(); // re-render with updated gold/holdings
    return true;
  }

  private closeShop(): void {
    if (this.state !== 'shop') return;
    this.ui.hideShop();
    this.state = 'playing';
  }

  private die(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    this.state = 'gameover';
    this.saveBest();
    this.commitLifetime(false);
    this.saveDaily();
    this.commitSalvage();
    this.ui.showEnd(
      this.buildRunSummary(false),
      () => this.start(),
      undefined,
      () => this.start(this.lastOperative, this.runSeed),
    );
  }

  private win(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    this.state = 'victory';
    this.saveBest();
    this.commitLifetime(true);
    this.saveDaily();
    this.commitSalvage();
    this.ui.showEnd(
      this.buildRunSummary(true),
      () => this.start(),
      () => this.enterEndless(),
      () => this.start(this.lastOperative, this.runSeed),
    );
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.showPausePanel();
  }

  /** Re-entrant so the settings panel can hand control straight back to the pause menu. */
  private showPausePanel(): void {
    this.ui.showPause(
      () => this.resume(),
      () => this.start(),
      () => this.openSettings(() => this.showPausePanel()),
    );
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.ui.hidePause();
    this.state = 'playing';
  }

  /** Victory screen → keep the run going; tyrants respawn on a timer, tougher each cycle. */
  private enterEndless(): void {
    if (this.state !== 'victory' || !this.ctx) return;
    const d = this.ctx.director;
    d.endless = true;
    d.bossCycle = 0;
    d.nextBossAt = this.ctx.time.elapsed + ENDLESS_BOSS_INTERVAL;
    this.state = 'playing';
    this.ui.hideEnd();
    this.ui.toast(
      tr('无尽尸潮已开启', 'Endless horde unlocked'),
      tr(
        `母巢暴君将每 ${ENDLESS_BOSS_INTERVAL} 秒回归，且一次比一次强`,
        `The Hive Tyrant returns every ${ENDLESS_BOSS_INTERVAL}s, stronger each time`,
      ),
    );
    this.ctx.audio.boss();
  }

  private buildRunSummary(victory: boolean): RunSummary {
    const ctx = this.ctx!;
    const lo = ctx.world.get(ctx.player, Loadout)!;
    const primary = primaryWeapon(lo);
    const stage = currentRunStage(ctx.time.elapsed).index;
    return {
      victory,
      time: ctx.time.elapsed,
      kills: ctx.stats.kills,
      best: this.best,
      stage,
      primaryWeapon: primary.def.name,
      gold: ctx.equip.gold,
      cause: victory ? tr('击败母巢暴君', 'Defeated the Hive Tyrant') : this.lastDamageCause,
      nextGoal: this.nextGoal(stage, primary.level, !!ctx.director.endless),
      maxCombo: ctx.run.combo.best,
      elites: ctx.run.elitesKilled,
      crates: ctx.run.cratesOpened,
      tyrants: ctx.run.tyrantsSlain,
      endless: !!ctx.director.endless,
      newAchievements: this.runAchievements.map((a) => ({ name: a.name, desc: a.desc })),
      achProgress: { unlocked: this.unlockedAch.size, total: ACHIEVEMENTS.length },
      rescued: ctx.run.rescued,
      seed: formatSeed(this.runSeed),
      daily: this.runDailyKey !== null,
      salvage: this.runDailyKey !== null ? null : this.lastSalvageGain,
      build: {
        weapons: (lo?.weapons ?? []).map((wi) => ({ name: wi.def.name, level: wi.level })),
        passives: passiveList(ctx).map((pv) => ({ name: pv.name, level: pv.level })),
      },
      operative: this.lastOpProgress ?? { name: operativeById(this.lastOperative).name, level: 1, gained: 0, leveledUp: false },
    };
  }

  private nextGoal(stage: number, weaponLevel: number, endless: boolean): string {
    if (endless) return tr('下一目标：在无尽尸潮中走得更远', 'Next goal: get further into the endless horde');
    if (stage < 2) return tr('下一目标：抵达第 2 阶段', 'Next goal: reach stage 2');
    if (weaponLevel < 3) return tr('下一目标：将主武器升到 Lv.3', 'Next goal: take your primary weapon to Lv.3');
    return tr('下一目标：击败母巢暴君', 'Next goal: defeat the Hive Tyrant');
  }

  /** Today's daily keeps its own best, since every player got the exact same world. */
  private saveDaily(): void {
    if (!this.ctx || this.runDailyKey === null) return;
    const key = this.runDailyKey;
    const time = Math.floor(this.ctx.time.elapsed);
    const kills = this.ctx.stats.kills;
    const prev = this.dailyRecords[key];
    if (prev && prev.time >= time) return;
    this.dailyRecords[key] = { time, kills };
    this.persist();
  }

  /**
   * Salvage: every run pays out, win or lose. Banked as a delta because an endless run can
   * reach the summary twice, and never on the daily, which runs without permanent power.
   */
  private commitSalvage(): void {
    if (!this.ctx || this.runDailyKey !== null) return;
    const total = salvageGain({
      time: this.ctx.time.elapsed,
      goldLeft: this.ctx.equip.gold,
      elites: this.ctx.run.elitesKilled,
      tyrants: this.ctx.run.tyrantsSlain,
      victory: this.winCounted,
    });
    const delta = Math.max(0, total - this.salvageCommitted);
    this.salvageCommitted = total;
    this.lastSalvageGain = total;
    this.salvage += delta;
    this.saveMeta();
  }

  private saveMeta(): void {
    this.persist();
  }

  private saveBest(): void {
    if (!this.ctx) return;
    const t = Math.floor(this.ctx.time.elapsed);
    if (t > this.best) {
      this.best = t;
      this.persist();
    }
  }

  /** Dev-only QA helper: jump the run clock forward to reach time-gated events. */
  debugSkip(seconds: number): void {
    if (this.ctx) this.ctx.time.elapsed += seconds;
  }

  /**
   * Draw one frame. The world goes to the canvas layer; the HUD is DOM and is rebuilt from
   * a plain snapshot, so neither path can reach back into the simulation.
   */
  render(): void {
    this.world.draw(this.ctx, this.settings);
    const ctx = this.ctx;
    if (ctx && this.state !== 'title') this.ui.updateHud(buildHudData(ctx));
  }

  private onKey(e: KeyboardEvent): void {
    if (this.settingsBack) {
      // The settings panel overlays whatever state we came from; Esc backs out of it.
      if (e.code === 'Escape') this.settingsBack();
      return;
    }
    if (this.state === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
      this.start(this.ui.selectedOperative() || this.lastOperative);
    } else if (this.state === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) this.pick(i);
      else if (e.code === 'KeyR') this.reroll();
    } else if (this.state === 'shop') {
      if (e.code === 'KeyB' || e.code === 'Escape') this.closeShop();
    } else if (this.state === 'playing') {
      if (e.code === 'KeyB') this.openShop();
      else if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
    } else if (this.state === 'paused') {
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Space') this.resume();
    } else if (this.state === 'victory' && e.code === 'KeyE') {
      this.enterEndless();
    } else if ((this.state === 'gameover' || this.state === 'victory') && (e.code === 'Space' || e.code === 'Enter')) {
      this.start();
    }
  }
}
