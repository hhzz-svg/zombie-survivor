import { World } from './ecs/world';
import { makeRng } from './ecs/rng';
import { SpatialHash } from './ecs/spatialHash';
import { FX } from './fx/fx';
import { CorpseFX } from './fx/corpseFX';
import { BloodDecals } from './fx/bloodDecals';
import { enemySpriteSize } from './render/spriteScale';
import { actorDepth, recoilAmount, walkMotion } from './render/motion';
import { combatActorPose } from './render/combatActor';
import { AudioBus } from './audio/audio';
import type { Renderer } from './render/renderer';
import { AssetStore } from './render/assets';
import { Input } from './input/input';
import { DomInput } from './input/provider';
import type { GameContext, PlayerStats, EquipmentState, SkillState } from './ctx';
import {
  PLAYER_BASE, RUN_STAGES, currentRunStage, xpToNext,
  activeSurge, incomingSurge, COMBO_WINDOW, ENDLESS_BOSS_INTERVAL, SUPPLY_FALL_SECONDS,
} from './data/balance';
import { MAX_WEAPON_LEVEL } from './data/weapons';
import { EQUIPMENT } from './data/equipment';
import { SKILLS } from './data/skills';
import {
  OPERATIVES, DEFAULT_OPERATIVE, operativeById, applyOperative,
  applyOperativeLevel, opLevelFromXp, opXpGain, opLevelBonusText,
} from './data/operatives';
import { ACHIEVEMENTS, evaluateAchievements, type AchieveSnapshot, type AchievementDef } from './data/achievements';
import { createPlayer } from './factory';
import { runSystems } from './systems/pipeline';
import { useItem, startBuff } from './systems/equipment';
import { buySkill, skillCooldownRemaining, useSkill } from './systems/skills';
import { comboTier, freshRunState } from './systems/combo';
import {
  Transform, Health, Renderable, Enemy, Aim, Loadout, Medkit, Bullet, XPGem, GoldCoin, Velocity,
  Lifetime, SupplyCrate, CurseAltar, Survivor, Wingman, type WeaponInst,
} from './components';
import { SURVIVOR_WAIT } from './data/wingmen';
import { makeChoices, applyChoice, type Choice } from './progression';
import { UI, type RunSummary } from './ui/ui';
import { currentShopOffers, type ShopOffer } from './shop';

type State = 'title' | 'playing' | 'paused' | 'levelup' | 'shop' | 'gameover' | 'victory';

interface LifetimeStats {
  kills: number;
  runs: number;
  wins: number;
}

/** '#rrggbb' → 'r,g,b' for the renderer's edge-glow gradients. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Orchestrates the run: state machine, system pipeline, world rendering, and the UI screens. */
export class Game {
  private readonly keys = new Input();
  private readonly ui = new UI();
  private readonly audio = new AudioBus();
  private readonly fx = new FX();
  private readonly corpses = new CorpseFX();
  private readonly blood = new BloodDecals();
  private readonly hash = new SpatialHash(40);
  private readonly assets = new AssetStore();
  private ctx: GameContext | null = null;
  private state: State = 'title';
  private pendingLevels = 0;
  private choices: Choice[] = [];
  private best: number;
  private lastFootstep = 0; // player footfall index, to fire step dust exactly on contact
  private lastDamageCause = '尚未受到致命伤害';
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
    this.best = Number(localStorage.getItem('zs-best') || '0') || 0;
    this.lastOperative = localStorage.getItem('zs-operative') || DEFAULT_OPERATIVE;
    this.unlockedAch = new Set(this.loadJson<string[]>('zs-ach', []));
    this.lifetime = this.loadJson<LifetimeStats>('zs-life', { kills: 0, runs: 0, wins: 0 });
    this.opXp = this.loadJson<Record<string, number>>('zs-ops', {});
    void this.assets.load();
    this.showTitle();
    this.ui.setShopHandler(() => this.openShop());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private loadJson<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private showTitle(): void {
    const progress: Record<string, { level: number; into: number; next: number; bonus: string }> = {};
    for (const op of OPERATIVES) {
      const lv = opLevelFromXp(this.opXp[op.id] ?? 0);
      progress[op.id] = { ...lv, bonus: opLevelBonusText(op, lv.level) };
    }
    this.ui.showTitle(
      this.best,
      OPERATIVES,
      this.lastOperative,
      (id) => this.start(id),
      { unlocked: this.unlockedAch.size, total: ACHIEVEMENTS.length },
      () => this.ui.showAchievements(ACHIEVEMENTS, this.unlockedAch, () => this.showTitle()),
      progress,
    );
  }

  private freshStats(): PlayerStats {
    return {
      level: 1, xp: 0, xpToNext: xpToNext(1), kills: 0,
      damageMul: 1, fireRateMul: 1, moveSpeed: PLAYER_BASE.moveSpeed, maxHp: PLAYER_BASE.maxHp,
      pierceBonus: 0, magnet: 0, projectileBonus: 0, crit: 0, lifesteal: 0,
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

  start(operativeId?: string): void {
    const op = operativeById(operativeId ?? this.lastOperative);
    this.lastOperative = op.id;
    localStorage.setItem('zs-operative', op.id);
    this.audio.resume();
    this.fx.clear();
    this.corpses.clear();
    this.blood.clear();
    this.hash.clear();
    this.lastDamageCause = '尚未受到致命伤害';
    const world = new World(makeRng((performance.now() * 1000) >>> 0));
    const ctx: GameContext = {
      world,
      player: 0,
      hash: this.hash,
      fx: this.fx,
      audio: this.audio,
      time: { elapsed: 0, hitStop: 0 },
      director: { budget: 0, bossSpawned: false, bossDead: false },
      stats: applyOperativeLevel(
        applyOperative(this.freshStats(), op),
        op,
        opLevelFromXp(this.opXp[op.id] ?? 0).level,
      ),
      equip: this.freshEquip(),
      skills: this.freshSkills(),
      run: freshRunState(),
      input: new DomInput(this.keys, this.renderer),
      rng: world.rng,
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
        onEnemyKilled: (x, y, key, r, isBoss, flipX) => this.corpses.spawnCorpse(x, y, key, r, isBoss, flipX),
        onEnemyKnocked: (x, y, key, r, isBoss, flipX) => this.corpses.spawnAfter(x, y, key, r, isBoss, flipX),
        onBloodSplat: (x, y, r) => this.blood.spawn(x, y, r),
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
    this.corpses.update(dt);
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
      this.ui.toast(`成就解锁 · ${a.name}`, a.desc, 'achieve');
      const pt = this.ctx.world.get(this.ctx.player, Transform);
      if (pt) this.ctx.fx.text(pt.x, pt.y - 46, `成就 · ${a.name}`, '#61e5de', 15);
    }
    this.ctx.audio.levelUp();
    localStorage.setItem('zs-ach', JSON.stringify([...this.unlockedAch]));
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
    localStorage.setItem('zs-life', JSON.stringify(this.lifetime));
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
    localStorage.setItem('zs-ops', JSON.stringify(this.opXp));
    const after = opLevelFromXp(this.opXp[op.id]!).level;
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
    this.ui.showLevelUp(this.choices, (i) => this.pick(i));
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
      this.ui.showLevelUp(this.choices, (j) => this.pick(j));
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
        return remain > 0 ? `冷却 ${Math.ceil(remain)}s` : '已解锁';
      }
      const def = EQUIPMENT.find((e) => e.id === id);
      if (!def) return '';
      if (def.kind === 'charge') {
        const n = eq.charges.get(id) ?? 0;
        return n > 0 ? `持有 ×${n}` : '';
      }
      if (def.kind === 'shield') {
        return eq.shield > 0 ? `护盾 ×${eq.shield}` : '';
      }
      const until = eq.buffs.get(id);
      if (until !== undefined && this.ctx!.time.elapsed < until) {
        return `生效中 ${Math.ceil(until - this.ctx!.time.elapsed)}s`;
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
    const eq = this.ctx.equip;
    if (offer.type === 'skill') {
      const ok = buySkill(this.ctx, offer.id);
      if (!ok) return false;
      this.audio.levelUp();
      this.ctx.screen.shake = Math.max(this.ctx.screen.shake, 4);
      this.renderShop();
      return true;
    }

    const id = offer.id;
    const def = EQUIPMENT.find((e) => e.id === id);
    if (!def || eq.gold < def.cost) return false;

    eq.gold -= def.cost;

    switch (def.kind) {
      case 'charge':
        eq.charges.set(id, (eq.charges.get(id) ?? 0) + 1);
        break;
      case 'shield':
        eq.shield++;
        break;
      case 'buff':
        startBuff(this.ctx, id, def.duration ?? 30);
        break;
    }

    this.audio.levelUp();
    this.ctx.screen.shake = Math.max(this.ctx.screen.shake, 4);

    // Re-render shop with updated gold/holdings.
    this.renderShop();
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
    this.ui.showEnd(this.buildRunSummary(false), () => this.start());
  }

  private win(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    this.state = 'victory';
    this.saveBest();
    this.commitLifetime(true);
    this.ui.showEnd(this.buildRunSummary(true), () => this.start(), () => this.enterEndless());
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause(() => this.resume(), () => this.start());
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
    this.ui.toast('无尽尸潮已开启', `母巢暴君将每 ${ENDLESS_BOSS_INTERVAL} 秒回归，且一次比一次强`);
    this.ctx.audio.boss();
  }

  private buildRunSummary(victory: boolean): RunSummary {
    const ctx = this.ctx!;
    const lo = ctx.world.get(ctx.player, Loadout);
    const primary = this.primaryWeapon(lo);
    const stage = currentRunStage(ctx.time.elapsed).index;
    return {
      victory,
      time: ctx.time.elapsed,
      kills: ctx.stats.kills,
      best: this.best,
      stage,
      primaryWeapon: primary.def.name,
      gold: ctx.equip.gold,
      cause: victory ? '击败母巢暴君' : this.lastDamageCause,
      nextGoal: this.nextGoal(stage, primary.level, !!ctx.director.endless),
      maxCombo: ctx.run.combo.best,
      elites: ctx.run.elitesKilled,
      crates: ctx.run.cratesOpened,
      tyrants: ctx.run.tyrantsSlain,
      endless: !!ctx.director.endless,
      newAchievements: this.runAchievements.map((a) => ({ name: a.name, desc: a.desc })),
      achProgress: { unlocked: this.unlockedAch.size, total: ACHIEVEMENTS.length },
      rescued: ctx.run.rescued,
      operative: this.lastOpProgress ?? { name: operativeById(this.lastOperative).name, level: 1, gained: 0, leveledUp: false },
    };
  }

  private nextGoal(stage: number, weaponLevel: number, endless: boolean): string {
    if (endless) return '下一目标：在无尽尸潮中走得更远';
    if (stage < 2) return '下一目标：抵达第 2 阶段';
    if (weaponLevel < 3) return '下一目标：将主武器升到 Lv.3';
    return '下一目标：击败母巢暴君';
  }

  private threatLabel(stage: number, elapsed: number): string {
    if (this.ctx?.director.endless) return '威胁：无尽尸潮';
    if (stage >= 5) return '威胁：母巢逼近';
    if (elapsed < 30) return '威胁：低';
    if (stage >= 4) return '威胁：极高';
    if (stage >= 3) return '威胁：高';
    return '威胁：中';
  }

  private primaryWeapon(lo?: { weapons: WeaponInst[]; activeWeapon?: string }): WeaponInst {
    return lo?.weapons.find((wi) => wi.def.id === lo.activeWeapon)
      ?? lo?.weapons.find((wi) => wi.def.kind === 'aim')
      ?? lo!.weapons[0]!;
  }

  private saveBest(): void {
    if (!this.ctx) return;
    const t = Math.floor(this.ctx.time.elapsed);
    if (t > this.best) {
      this.best = t;
      localStorage.setItem('zs-best', String(t));
    }
  }

  /** Dev-only QA helper: jump the run clock forward to reach time-gated events. */
  debugSkip(seconds: number): void {
    if (this.ctx) this.ctx.time.elapsed += seconds;
  }

  private onKey(e: KeyboardEvent): void {
    if (this.state === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
      this.start(this.ui.selectedOperative() || this.lastOperative);
    } else if (this.state === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) this.pick(i);
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

  render(): void {
    const r = this.renderer;
    let camX = 0;
    let camY = 0;
    const ctx = this.ctx;
    if (ctx) {
      const pt = ctx.world.get(ctx.player, Transform);
      if (pt) {
        ctx.camera.x = pt.x;
        ctx.camera.y = pt.y;
        camX = pt.x;
        camY = pt.y;
      }
    }
    let sx = 0;
    let sy = 0;
    if (ctx && ctx.screen.shake > 0) {
      const sh = ctx.screen.shake;
      sx = (Math.random() - 0.5) * sh * 2;
      sy = (Math.random() - 0.5) * sh * 2;
      ctx.screen.shake *= 0.86;
      if (ctx.screen.shake < 0.3) ctx.screen.shake = 0;
    }

    r.begin({ x: camX + sx, y: camY + sy });
    this.drawGround(camX, camY, r);
    if (ctx) {
      this.blood.draw(r); // blood painted on the ground, never fades
      this.corpses.draw(r, this.assets); // corpses/afterimages sit under the living
      this.drawWorld(ctx, r);
      ctx.fx.draw(r);
      const pt = ctx.world.get(ctx.player, Transform);
      if (pt) {
        const pressure = Math.min(1, ctx.world.query(Enemy).length / 180 + currentRunStage(ctx.time.elapsed).index * 0.08);
        r.drawAtmosphere(pt.x, pt.y, pressure);
      }
      // blood-moon storm: pulsing red edges; combo fever: tier-colored glow
      const surge = activeSurge(ctx.time.elapsed);
      if (surge) {
        const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);
        r.drawEdgeGlow('255,60,60', 0.7 * pulse);
      } else {
        const tier = comboTier(ctx.run.combo.count);
        if (tier.at >= 50) {
          const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 240);
          r.drawEdgeGlow(hexToRgb(tier.color), 0.55 * pulse);
        }
      }
    }
    // low-health vignette drawn in screen space (not world)
    if (ctx) {
      const ph = ctx.world.get(ctx.player, Health);
      if (ph) {
        const hpPct = ph.hp / ctx.stats.maxHp;
        const vig = hpPct < 0.3 ? Math.pow(1 - hpPct / 0.3, 1.8) : 0;
        r.drawVignette(vig);
      }
    }
    r.end();

    if (ctx && this.state !== 'title') this.updateHud(ctx);
  }

  private drawGround(cx: number, cy: number, r: Renderer): void {
    const hw = r.width / 2;
    const hh = r.height / 2;
    const ground = this.assets.get('ground');
    if (ground) {
      const T = 256;
      for (let x = Math.floor((cx - hw) / T) * T; x < cx + hw + T; x += T) {
        for (let y = Math.floor((cy - hh) / T) * T; y < cy + hh + T; y += T) {
          r.drawSprite(ground, x + T / 2, y + T / 2, T, T, false);
        }
      }
    } else {
      const G = 64;
      for (let x = Math.floor((cx - hw) / G) * G; x < cx + hw + G; x += G) r.drawRect(x, cy, 1, r.height, '#141a17');
      for (let y = Math.floor((cy - hh) / G) * G; y < cy + hh + G; y += G) r.drawRect(cx, y, r.width, 1, '#141a17');
    }
  }

  private drawWorld(ctx: GameContext, r: Renderer): void {
    const w = ctx.world;
    const pt = w.get(ctx.player, Transform);
    const px = pt ? pt.x : 0;
    const py = pt ? pt.y : 0;
    const now = performance.now();
    const actors: Array<{ depth: number; draw: () => void }> = [];
    const bullets: Array<() => void> = [];

    for (const e of w.query(Renderable, Transform)) {
      const t = w.get(e, Transform)!;
      const rd = w.get(e, Renderable)!;
      const en = w.get(e, Enemy);
      if (en) {
        actors.push({
          depth: actorDepth(t.y, rd.r),
          draw: () => {
            const v = w.get(e, Velocity);
            const sp = v ? Math.hypot(v.x, v.y) : 0;
            const anim = walkMotion(now, sp, t.x + t.y, en.def.isBoss ? 0.6 : 1);
            const dx = px - t.x;
            const dy = py - t.y;
            const dist = Math.hypot(dx, dy) || 1;
            const attackRange = rd.r + PLAYER_BASE.radius + 24;
            const lunge = dist < attackRange ? (1 - dist / attackRange) * 5 : 0;
            const ox = (dx / dist) * lunge;
            const oy = (dy / dist) * lunge;
            const squash = anim.squash + Math.min(0.04, (lunge / 5) * 0.04);
            const x = t.x + ox;
            const y = t.y + oy;
            if (en.elite) {
              // affix-colored ground aura marks the threat before the sprite reads
              const ep = 0.55 + 0.45 * Math.sin(now / 200 + t.x * 0.13);
              r.drawEllipse(x, y + rd.r * 0.75, rd.r * 1.3, rd.r * 0.55, en.elite.color, 0.16 + ep * 0.1);
              r.drawRing(x, y + rd.r * 0.4, rd.r + 5, en.elite.color, 2.2, 0.4 + ep * 0.35);
            }
            r.drawEllipse(x, y + rd.r * 0.75, rd.r * (0.9 - squash * 0.5), rd.r * 0.38, 'rgba(0,0,0,0.3)');
            if (en.def.behavior === 'golden') {
              // no sprite on purpose: a glowing gold streaker with an escape blink
              const lt = w.get(e, Lifetime);
              const blink = lt && lt.t < 3 && Math.floor(now / 130) % 2 === 0;
              if (!blink) {
                const shimmer = 0.75 + 0.25 * Math.sin(now / 90);
                r.drawGlowCircle(x, y - anim.bob, rd.r + 2 * shimmer, '#fff3c2', '#ffd700');
                r.drawCircle(x, y - anim.bob, rd.r * 0.5, '#fff8dc', 0.95);
              }
              return;
            }
            // tags only near the player — full-horde tag spam reads as noise
            const showTag = en.elite && dist < 340;
            const img = this.assets.get(en.def.id);
            if (img) {
              const size = enemySpriteSize(rd.r, en.def.isBoss);
              const sw = size * (1 + squash);
              const sh = size * (1 - squash);
              r.drawSprite(img, x, y + rd.r - sh / 2 - anim.bob, sw, sh, px - t.x < 0);
              if (showTag) {
                r.drawText(x, y + rd.r - sh - 9, `${en.elite!.name}·${en.def.name}`, en.elite!.color, 11, 'center', 0.92);
              }
            } else {
              r.drawCircle(x, y, rd.r, rd.color);
              if (en.def.isBoss) r.drawRing(x, y, rd.r + 6, '#ffd0e6', 3);
              if (showTag) r.drawText(x, y - rd.r - 10, `${en.elite!.name}·${en.def.name}`, en.elite!.color, 11, 'center', 0.92);
            }
            const h = w.get(e, Health);
            if (h && h.flash > 0) r.drawCircle(x, y, rd.r, '#ffffff', 0.45);
          },
        });
      } else if (w.has(e, Survivor)) {
        const sv = w.get(e, Survivor)!;
        actors.push({
          depth: actorDepth(t.y, 11),
          draw: () => {
            const remain = Math.max(0, sv.until - ctx.time.elapsed);
            const frac = remain / SURVIVOR_WAIT;
            const pulse = 0.5 + 0.5 * Math.sin(now / 220);
            r.drawEllipse(t.x, t.y + 9, 10, 4.2, 'rgba(0,0,0,0.32)');
            const img = this.assets.get('player');
            if (img) {
              // cowering figure: same survivor art, slightly shrunken and rocking
              const size = 52;
              r.drawSpriteRot(img, t.x, t.y + 11 - size / 2, size, size, Math.sin(now / 300) * 0.06, false, 1, size / 2);
            } else {
              r.drawCircle(t.x, t.y, 10, sv.def.color);
            }
            // distress beacon + shrinking patience ring
            r.drawRing(t.x, t.y + 4, 26, `rgba(234,255,247,${0.35 + pulse * 0.3})`, 2);
            r.drawRing(t.x, t.y + 4, 14 + 18 * frac, sv.def.color, 2, 0.75);
            r.drawGlowCircle(t.x, t.y - 34 + Math.sin(now / 260) * 2.5, 3.2, '#ffffff', sv.def.color);
            r.drawText(t.x, t.y - 44, `救援 ${sv.def.name} ${Math.ceil(remain)}s`, '#eafff7', 11, 'center', 0.95);
          },
        });
      } else if (w.has(e, Wingman)) {
        const wm = w.get(e, Wingman)!;
        actors.push({
          depth: actorDepth(t.y, 10),
          draw: () => {
            const v = w.get(e, Velocity);
            const sp = v ? Math.hypot(v.x, v.y) : 0;
            const anim = walkMotion(now, sp, t.x + t.y, 1.05);
            const h = w.get(e, Health)!;
            const flick = wm.invuln > 0 && Math.floor(ctx.time.elapsed * 18) % 2 === 0;
            r.drawEllipse(t.x, t.y + 8, 9 * (0.95 - anim.squash * 0.5), 3.8, 'rgba(0,0,0,0.32)');
            r.drawEllipse(t.x, t.y + 8, 15, 6, wm.def.color, 0.16); // squad ground tint
            if (!flick) {
              const img = this.assets.get('player');
              if (img) {
                const size = 54;
                const sw = size * (1 + anim.squash);
                const sh = size * (1 - anim.squash);
                r.drawSprite(img, t.x, t.y + 10 - sh / 2 - anim.bob, sw, sh, (v?.x ?? 0) < 0);
              } else {
                r.drawCircle(t.x, t.y, 10, wm.def.color);
              }
              if (h.flash > 0) r.drawCircle(t.x, t.y, 11, '#ffffff', 0.4);
            }
            // role marker + slim HP sliver above the head
            r.drawGlowCircle(t.x, t.y - 34, 2.6, '#ffffff', wm.def.color);
            const hpFrac = Math.max(0, h.hp / h.max);
            r.drawRect(t.x, t.y - 27, 24, 3, 'rgba(0,0,0,0.55)');
            r.drawRect(t.x - 12 + 12 * hpFrac, t.y - 27, 24 * hpFrac, 3, wm.def.color);
          },
        });
      } else if (w.has(e, SupplyCrate)) {
        const sc = w.get(e, SupplyCrate)!;
        const falling = ctx.time.elapsed < sc.landAt;
        if (falling) {
          const k = Math.max(0, (sc.landAt - ctx.time.elapsed) / SUPPLY_FALL_SECONDS); // 1 → touchdown 0
          const drop = k * 190;
          const sway = Math.sin(now / 260) * 9 * k;
          const cx = t.x + sway;
          const cy = t.y - drop;
          r.drawEllipse(t.x, t.y + 5, 15 * (1 - k * 0.5), 6 * (1 - k * 0.5), `rgba(0,0,0,${0.3 * (1 - k * 0.4)})`);
          r.drawLine(cx - 13, cy - 22, cx - 5, cy - 5, '#cfd8c2', 1.4, 0.8);
          r.drawLine(cx + 13, cy - 22, cx + 5, cy - 5, '#cfd8c2', 1.4, 0.8);
          r.drawEllipse(cx, cy - 26, 20, 9, '#5f8f6a', 0.94);
          r.drawEllipse(cx, cy - 28, 13, 5.5, '#7fb283', 0.9);
          r.drawRect(cx, cy, 20, 16, '#8a6d3b');
          r.drawRect(cx, cy, 20, 3.4, '#c9a55a');
          r.drawRect(cx, cy, 3.4, 16, '#c9a55a');
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(now / 220);
          r.drawRect(t.x, t.y - 34, 3, 58, `rgba(255,209,102,${0.15 + pulse * 0.12})`);
          r.drawEllipse(t.x, t.y + 8, 15, 6, 'rgba(0,0,0,0.3)');
          r.drawRect(t.x, t.y, 22, 17, '#8a6d3b');
          r.drawRect(t.x, t.y, 22, 4, '#c9a55a');
          r.drawRect(t.x, t.y, 4, 17, '#c9a55a');
          r.drawGlowCircle(t.x, t.y - 14, 3.4 + pulse * 2, '#fff6dd', '#ffd166');
          r.drawRing(t.x, t.y + 4, 25 + pulse * 5, `rgba(255,209,102,${0.5 - pulse * 0.22})`, 2);
        }
      } else if (w.has(e, CurseAltar)) {
        // blood-curse altar: dark obelisk, red rune glow, hungry pulsing ring
        const pulse = 0.5 + 0.5 * Math.sin(now / 340 + t.x * 0.05);
        r.drawEllipse(t.x, t.y + 16, 17, 6.5, 'rgba(0,0,0,0.35)');
        r.drawRect(t.x, t.y + 4, 22, 10, '#241418');
        r.drawRect(t.x, t.y - 6, 14, 26, '#33191f');
        r.drawRect(t.x, t.y - 8, 8, 22, '#47222b');
        r.drawGlowCircle(t.x, t.y - 8, 3.2 + pulse * 1.8, '#ffb3ab', '#e0344a');
        r.drawRing(t.x, t.y + 10, 24 + pulse * 6, `rgba(224,52,74,${0.55 - pulse * 0.25})`, 2);
        r.drawText(t.x, t.y - 30, '血怨祭坛', '#ff5a6a', 11, 'center', 0.65 + pulse * 0.3);
      } else if (w.has(e, GoldCoin)) {
        const img = this.assets.get('coin');
        if (img) {
          const size = rd.r * 3;
          const bob = Math.sin(now / 300 + t.x * 0.2) * 2;
          r.drawSprite(img, t.x, t.y + bob, size, size, false);
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(now / 180 + t.x * 0.3);
          r.drawCircle(t.x, t.y, rd.r + 3, '#ffd700', 0.3);
          r.drawCircle(t.x, t.y, rd.r, '#ffd700');
          r.drawCircle(t.x, t.y, rd.r * 0.5, '#fff8dc', 0.7 + pulse * 0.3);
        }
      } else if (w.has(e, Medkit)) {
        r.drawRect(t.x, t.y, rd.r * 2, rd.r * 2, '#c0352f');
        r.drawRect(t.x, t.y, rd.r * 1.2, rd.r * 0.44, '#ffffff');
        r.drawRect(t.x, t.y, rd.r * 0.44, rd.r * 1.2, '#ffffff');
      } else if (w.has(e, XPGem)) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 220 + t.x);
        r.drawCircle(t.x, t.y, rd.r + 3, '#39b9ff', 0.28);
        r.drawCircle(t.x, t.y, rd.r, '#7fdcff');
        r.drawCircle(t.x, t.y, rd.r * 0.5, '#eaffff', 0.7 + pulse * 0.3);
      } else if (w.has(e, Bullet)) {
        bullets.push(() => {
          const v = w.get(e, Velocity)!;
          const b = w.get(e, Bullet)!;
          if (b.team === 'enemy') {
            r.drawTracer(t.x, t.y, v.x, v.y, 16, rd.r * 2, '#eaffd0', '#7be23a');
          } else if (b.style === 'flame') {
            // ragged flame tongue: flickering glow blob, hot core, no tracer tail
            const flick = 0.7 + 0.3 * Math.sin(now / 34 + t.x * 0.6 + t.y * 0.4);
            r.drawGlowCircle(t.x, t.y, (3.4 + flick * 3.2), '#fff3b0', '#ff6b1a');
            r.drawCircle(t.x, t.y, 1.8 + flick, '#ffd166', 0.85);
          } else if (b.style === 'rocket') {
            r.drawTracer(t.x, t.y, v.x, v.y, 30, rd.r * 2.6, '#fff2d9', '#ff8a3c');
            r.drawGlowCircle(t.x, t.y, 5.4, '#fffdf0', '#ffb43c');
          } else {
            r.drawTracer(t.x, t.y, v.x, v.y, 22, rd.r * 2.1, '#fffdf0', '#ffb43c');
          }
        });
      } else {
        r.drawCircle(t.x, t.y, rd.r, rd.color);
      }
    }

    const ph = w.get(ctx.player, Health);
    const aim = w.get(ctx.player, Aim);
    const pv = w.get(ctx.player, Velocity);
    const lo = w.get(ctx.player, Loadout);
    if (pt && ph) {
      actors.push({
        depth: actorDepth(pt.y, PLAYER_BASE.radius),
        draw: () => {
          const R = PLAYER_BASE.radius;
          const psp = pv ? Math.hypot(pv.x, pv.y) : 0;
          const anim = walkMotion(now, psp, pt.x + pt.y, 1.1);
          const facingLeft = aim ? aim.x < 0 : false;
          if (anim.step !== this.lastFootstep && psp > 30) {
            this.lastFootstep = anim.step;
            const back = pv && psp > 0 ? -pv.x / psp : 0;
            this.fx.spark(pt.x + back * R * 0.5, pt.y + R * 0.85, back, -0.35, 4, '#9a8f72', 70);
          }
          r.drawEllipse(pt.x, pt.y + R * 0.75, R * (0.95 - anim.squash * 0.5), R * 0.4, 'rgba(0,0,0,0.32)');
          const flick = ph.invuln > 0 && Math.floor(ctx.time.elapsed * 20) % 2 === 0;
          if (!flick) {
            const activeWeapon = lo ? this.primaryWeapon(lo) : undefined;
            const recoil = activeWeapon ? recoilAmount(activeWeapon.cd, activeWeapon.def.cooldown) : 0;
            const pose = combatActorPose({
              weaponSprite: activeWeapon?.def.sprite,
              aimX: aim?.x ?? (facingLeft ? -1 : 1),
              aimY: aim?.y ?? 0,
              radius: R,
              recoil,
              bob: anim.bob,
            });
            const img = this.assets.get(pose.key) ?? this.assets.get('player');
            if (img) {
              const sw = pose.size * (1 + anim.squash);
              const sh = pose.size * (1 - anim.squash);
              const baseLean = ((pv ? (pv.x / 200) * 0.14 : 0) + anim.rock) * (facingLeft ? -1 : 1);
              const lean = baseLean + pose.rotation - recoil * 0.035 * (facingLeft ? -1 : 1);
              r.drawSpriteRot(
                img,
                pt.x + pose.x,
                pt.y + R - sh / 2 + pose.y,
                sw,
                sh,
                lean,
                pose.flipX,
                1,
                sh / 2,
              );
              if (recoil > 0.12 && aim) {
                const mx = pt.x + pose.muzzleX;
                const my = pt.y + pose.muzzleY;
                r.drawGlowCircle(mx, my, 3.2 + recoil * 3, '#fff9d2', '#ff9b35');
                r.drawLine(mx, my, mx + aim.x * R * 1.35, my + aim.y * R * 1.35, '#ffd782', 2.4, recoil * 0.82);
              }
            } else {
              r.drawCircle(pt.x, pt.y, R, '#7fe6c0');
              r.drawCircle(pt.x, pt.y, R - 4, '#cffaea');
            }
          }
          if (ctx.equip.shield > 0) {
            const pulse = 0.6 + 0.4 * Math.sin(now / 300);
            r.drawRing(pt.x, pt.y, R + 10, `rgba(95,184,255,${pulse * 0.7})`, 2.5);
          }
          if (ctx.skills.barrierLayers > 0 && ctx.skills.barrierUntil > ctx.time.elapsed) {
            const pulse = 0.6 + 0.4 * Math.sin(now / 240);
            r.drawRing(pt.x, pt.y, R + 16, `rgba(116,199,255,${pulse * 0.78})`, 3);
          }
          if (ctx.skills.slowUntil > ctx.time.elapsed) {
            const pulse = 0.45 + 0.35 * Math.sin(now / 180);
            r.drawRing(pt.x, pt.y, R + 22, `rgba(168,144,255,${pulse})`, 2);
          }
          if ((ctx.equip.buffs.get('berserk') ?? -1) > ctx.time.elapsed) {
            const pulse = 0.5 + 0.5 * Math.sin(now / 100);
            r.drawRing(pt.x, pt.y, R + 14, `rgba(255,60,60,${pulse * 0.5})`, 3);
          }
          if (aim) r.drawCircle(pt.x + aim.x * (R + 8), pt.y + aim.y * (R + 8), 3, '#ffffff');
        },
      });
    }

    actors.sort((a, b) => a.depth - b.depth).forEach((actor) => actor.draw());
    bullets.forEach((draw) => draw());

    if (pt && lo) {
      for (const wi of lo.weapons) {
        if (wi.def.kind !== 'orbit') continue;
        const blades = wi.def.projectiles + ctx.stats.projectileBonus;
        const ph = wi.phase ?? 0;
        for (let b = 0; b < blades; b++) {
          const ang = ph + (b / blades) * Math.PI * 2;
          const bx = pt.x + Math.cos(ang) * wi.def.range;
          const by = pt.y + Math.sin(ang) * wi.def.range;
          r.drawGlowCircle(bx, by, 8, '#ffffff', '#5fd0ff');
        }
      }
    }
  }

  private updateHud(ctx: GameContext): void {
    const w = ctx.world;
    const ph = w.get(ctx.player, Health)!;
    const lo = w.get(ctx.player, Loadout)!;
    const stage = currentRunStage(ctx.time.elapsed);
    const stagePos = RUN_STAGES.findIndex((s) => s.index === stage.index);
    const nextStage = RUN_STAGES[stagePos + 1];
    const stageEnd = nextStage?.from ?? stage.from + 60;
    const stageSpan = Math.max(1, stageEnd - stage.from);
    const stageProgress = Math.min(1, Math.max(0, (ctx.time.elapsed - stage.from) / stageSpan));
    const nextStageIn = nextStage ? Math.max(0, nextStage.from - ctx.time.elapsed) : null;
    const primary = this.primaryWeapon(lo);
    const stageBanner = (ctx.director.stageBannerUntil ?? 0) > ctx.time.elapsed
      ? `阶段 ${stage.index} · ${stage.name}`
      : '';
    const tutorialTip = ctx.time.elapsed < 12
      ? '优先绕圈移动并拾取经验；前 30 秒拾取范围更大'
      : ctx.time.elapsed < 35
        ? '按 B 打开商店，用金币购买装备补足生存能力'
        : '';
    let bossHp: number | null = null;
    for (const e of w.query(Enemy)) {
      const en = w.get(e, Enemy)!;
      if (en.def.isBoss) {
        const h = w.get(e, Health)!;
        bossHp = h.hp / h.max;
        break;
      }
    }
    const threatLabel = bossHp !== null ? 'Boss 接战' : this.threatLabel(stage.index, ctx.time.elapsed);

    const tier = comboTier(ctx.run.combo.count);
    const combo = {
      count: ctx.run.combo.count,
      name: tier.name,
      color: tier.color,
      frac: ctx.run.combo.count > 0
        ? Math.max(0, Math.min(1, (ctx.run.combo.until - ctx.time.elapsed) / COMBO_WINDOW))
        : 0,
    };

    const act = activeSurge(ctx.time.elapsed);
    const inc = incomingSurge(ctx.time.elapsed);
    const surge = act
      ? { label: `血月尸潮 · 剩余 ${Math.ceil(act.at + act.duration - ctx.time.elapsed)}s`, active: true }
      : inc
        ? { label: `血月将至 ${Math.ceil(inc.at - ctx.time.elapsed)}s`, active: false }
        : null;

    const squad = w.query(Wingman).map((e) => {
      const wm = w.get(e, Wingman)!;
      const wh = w.get(e, Health)!;
      return { name: wm.def.name, color: wm.def.color, hpFrac: Math.max(0, wh.hp / wh.max) };
    });

    // Build the inventory bar: only currently-held consumables / active buffs.
    const items: Array<{ def: import('./data/equipment').EquipDef; count: number; remain: number }> = [];
    for (const eqDef of EQUIPMENT) {
      if (eqDef.kind === 'charge') {
        const count = ctx.equip.charges.get(eqDef.id) ?? 0;
        if (count > 0) items.push({ def: eqDef, count, remain: 0 });
      } else if (eqDef.kind === 'shield') {
        if (ctx.equip.shield > 0) items.push({ def: eqDef, count: ctx.equip.shield, remain: 0 });
      } else {
        const until = ctx.equip.buffs.get(eqDef.id);
        if (until !== undefined && ctx.time.elapsed < until) {
          items.push({ def: eqDef, count: 0, remain: until - ctx.time.elapsed });
        }
      }
    }

    this.ui.updateHud({
      stage: stage.index,
      stageName: stage.name,
      stageProgress,
      nextStageIn,
      threatLabel,
      primaryWeapon: {
        name: primary.def.name,
        level: primary.level,
        progress: Math.min(1, primary.level / MAX_WEAPON_LEVEL),
      },
      tutorialTip,
      stageBanner,
      hp: ph.hp,
      maxHp: ctx.stats.maxHp,
      xp: ctx.stats.xp,
      xpToNext: ctx.stats.xpToNext,
      level: ctx.stats.level,
      kills: ctx.stats.kills,
      time: ctx.time.elapsed,
      weapons: lo.weapons.map((wi) => ({ name: wi.def.name, level: wi.level })),
      bossHp,
      gold: ctx.equip.gold,
      items,
      skills: SKILLS
        .filter((skill) => ctx.skills.owned.has(skill.id))
        .map((skill) => ({
          def: skill,
          remain: skillCooldownRemaining(ctx, skill.id),
          active: skill.id === 'barrier'
            ? ctx.skills.barrierLayers > 0 && ctx.skills.barrierUntil > ctx.time.elapsed
            : skill.id === 'slow'
              ? ctx.skills.slowUntil > ctx.time.elapsed
              : skill.id === 'dash'
                ? ctx.skills.dashUntil > ctx.time.elapsed
                : false,
        })),
      shield: ctx.equip.shield,
      combo,
      surge,
      squad,
    });
  }
}
