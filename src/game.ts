import { World } from './ecs/world';
import { makeRng } from './ecs/rng';
import { SpatialHash } from './ecs/spatialHash';
import { FX } from './fx/fx';
import { CorpseFX } from './fx/corpseFX';
import { BloodDecals } from './fx/bloodDecals';
import { enemySpriteSize, playerSpriteSize } from './render/spriteScale';
import { AudioBus } from './audio/audio';
import type { Renderer } from './render/renderer';
import { AssetStore } from './render/assets';
import { playerWeaponSpriteKey } from './render/playerWeaponSprite';
import { Input } from './input/input';
import { DomInput } from './input/provider';
import type { GameContext, PlayerStats, EquipmentState } from './ctx';
import { PLAYER_BASE, xpToNext } from './data/balance';
import { EQUIPMENT } from './data/equipment';
import { createPlayer } from './factory';
import { runSystems } from './systems/pipeline';
import { useItem, startBuff } from './systems/equipment';
import { Transform, Health, Renderable, Enemy, Aim, Loadout, Medkit, Bullet, XPGem, GoldCoin, Velocity } from './components';
import { makeChoices, applyChoice, type Choice } from './progression';
import { UI } from './ui/ui';

type State = 'title' | 'playing' | 'levelup' | 'shop' | 'gameover' | 'victory';

/**
 * Procedural run cycle from a still sprite: while moving, bounce up/down (two bounces per
 * stride), squash-stretch on footfall, and rock the body left/right as legs alternate. Purely
 * visual (render-time), so it never touches sim determinism. `phase` offsets each entity so a
 * crowd doesn't move in lockstep; `rate` tunes the step cadence. `step` is the footfall index
 * (increments once per footstep) so callers can fire footstep FX exactly on contact.
 */
function walkAnim(
  nowMs: number, speed: number, phase: number, rate = 1,
): { bob: number; squash: number; rock: number; step: number } {
  if (speed < 6) return { bob: 0, squash: 0, rock: 0, step: 0 };
  const moving = Math.min(1, speed / 120);
  const w = nowMs / 1000 * 9 * rate + phase * 0.05;
  return {
    // bounce peaks mid-stride, dips to 0 on each footfall (sin → 0)
    bob: Math.abs(Math.sin(w)) * 3.6 * moving,
    // compress on footfall (when the bounce bottoms out)
    squash: -Math.cos(w * 2) * 0.06 * moving,
    // body rocks side to side, one full sway per two footfalls
    rock: Math.sin(w) * 0.07 * moving,
    step: Math.floor(w / Math.PI),
  };
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

  constructor(private readonly renderer: Renderer) {
    this.best = Number(localStorage.getItem('zs-best') || '0') || 0;
    void this.assets.load();
    this.ui.showTitle(this.best, () => this.start());
    this.ui.setShopHandler(() => this.openShop());
    window.addEventListener('keydown', (e) => this.onKey(e));
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

  start(): void {
    this.audio.resume();
    this.fx.clear();
    this.corpses.clear();
    this.blood.clear();
    this.hash.clear();
    const world = new World(makeRng((performance.now() * 1000) >>> 0));
    const ctx: GameContext = {
      world,
      player: 0,
      hash: this.hash,
      fx: this.fx,
      audio: this.audio,
      time: { elapsed: 0, hitStop: 0 },
      director: { budget: 0, bossSpawned: false, bossDead: false },
      stats: this.freshStats(),
      equip: this.freshEquip(),
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
      },
    };
    ctx.player = createPlayer(ctx);
    this.ctx = ctx;
    this.pendingLevels = 0;
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
    this.keys.flush();

    if (this.state === 'playing' && this.pendingLevels > 0) this.enterLevelUp();
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
    // Per-item "currently held" status line for the shop cards.
    const status = (id: string): string => {
      const def = EQUIPMENT.find((e) => e.id === id)!;
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
      status,
      (id: string) => this.buyItem(id),
      () => this.closeShop(),
    );
  }

  private buyItem(id: string): boolean {
    if (!this.ctx) return false;
    const eq = this.ctx.equip;
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
    this.ui.showEnd(false, this.ctx.time.elapsed, this.ctx.stats.kills, this.best, () => this.start());
  }

  private win(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    this.state = 'victory';
    this.saveBest();
    this.ui.showEnd(true, this.ctx.time.elapsed, this.ctx.stats.kills, this.best, () => this.start());
  }

  private saveBest(): void {
    if (!this.ctx) return;
    const t = Math.floor(this.ctx.time.elapsed);
    if (t > this.best) {
      this.best = t;
      localStorage.setItem('zs-best', String(t));
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.state === 'title' && (e.code === 'Space' || e.code === 'Enter')) this.start();
    else if (this.state === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) this.pick(i);
    } else if (this.state === 'shop') {
      if (e.code === 'KeyB' || e.code === 'Escape') this.closeShop();
    } else if (this.state === 'playing') {
      if (e.code === 'KeyB') this.openShop();
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
    const now = performance.now();

    for (const e of w.query(Renderable, Transform)) {
      const t = w.get(e, Transform)!;
      const rd = w.get(e, Renderable)!;
      const en = w.get(e, Enemy);
      if (en) {
        const v = w.get(e, Velocity);
        const sp = v ? Math.hypot(v.x, v.y) : 0;
        const anim = walkAnim(now, sp, t.x + t.y, en.def.isBoss ? 0.6 : 1);
        r.drawEllipse(t.x, t.y + rd.r * 0.75, rd.r * (0.9 - anim.squash * 0.5), rd.r * 0.38, 'rgba(0,0,0,0.3)');
        const img = this.assets.get(en.def.id);
        if (img) {
          const size = enemySpriteSize(rd.r, en.def.isBoss);
          const sw = size * (1 + anim.squash);
          const sh = size * (1 - anim.squash);
          r.drawSprite(img, t.x, t.y + rd.r - sh / 2 - anim.bob, sw, sh, px - t.x < 0);
        } else {
          r.drawCircle(t.x, t.y, rd.r, rd.color);
          if (en.def.isBoss) r.drawRing(t.x, t.y, rd.r + 6, '#ffd0e6', 3);
        }
        const h = w.get(e, Health);
        if (h && h.flash > 0) r.drawCircle(t.x, t.y, rd.r, '#ffffff', 0.45);
      } else if (w.has(e, GoldCoin)) {
        // Gold coin: use sprite if loaded, otherwise procedural glow
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
      } else if (w.has(e, Bullet)) {
        const v = w.get(e, Velocity)!;
        const enemyShot = w.get(e, Bullet)!.team === 'enemy';
        if (enemyShot) {
          r.drawTracer(t.x, t.y, v.x, v.y, 16, rd.r * 2, '#eaffd0', '#7be23a');
        } else {
          r.drawTracer(t.x, t.y, v.x, v.y, 22, rd.r * 2.1, '#fffdf0', '#ffb43c');
        }
      } else if (w.has(e, XPGem)) {
        // cheap layered glow (no shadowBlur) — gems can number in the hundreds
        const pulse = 0.5 + 0.5 * Math.sin(now / 220 + t.x);
        r.drawCircle(t.x, t.y, rd.r + 3, '#39b9ff', 0.28);
        r.drawCircle(t.x, t.y, rd.r, '#7fdcff');
        r.drawCircle(t.x, t.y, rd.r * 0.5, '#eaffff', 0.7 + pulse * 0.3);
      } else {
        r.drawCircle(t.x, t.y, rd.r, rd.color);
      }
    }

    const ph = w.get(ctx.player, Health);
    const aim = w.get(ctx.player, Aim);
    const pv = w.get(ctx.player, Velocity);
    const lo = w.get(ctx.player, Loadout);
    if (pt && ph) {
      const R = PLAYER_BASE.radius;
      const psp = pv ? Math.hypot(pv.x, pv.y) : 0;
      const anim = walkAnim(now, psp, pt.x + pt.y, 1.1);
      const facingLeft = aim ? aim.x < 0 : false;
      // Kick up a little dust on each footfall while actually running.
      if (anim.step !== this.lastFootstep && psp > 30) {
        this.lastFootstep = anim.step;
        // Spray dust backward (opposite travel) from the feet.
        const back = pv && psp > 0 ? -pv.x / psp : 0;
        this.fx.spark(pt.x + back * R * 0.5, pt.y + R * 0.85, back, -0.35, 4, '#9a8f72', 70);
      }
      r.drawEllipse(pt.x, pt.y + R * 0.75, R * (0.95 - anim.squash * 0.5), R * 0.4, 'rgba(0,0,0,0.32)');
      const flick = ph.invuln > 0 && Math.floor(ctx.time.elapsed * 20) % 2 === 0;
      if (!flick) {
        const img = this.assets.get(playerWeaponSpriteKey(lo?.activeWeapon)) ?? this.assets.get('player');
        if (img) {
          const size = playerSpriteSize(R);
          const sw = size * (1 + anim.squash);
          const sh = size * (1 - anim.squash);
          // Lean into the run: forward tilt toward movement + alternating stride rock.
          // drawSpriteRot mirrors rotation when flipped, so negate to keep lean true to velocity.
          const lean = ((pv ? (pv.x / 200) * 0.14 : 0) + anim.rock) * (facingLeft ? -1 : 1);
          r.drawSpriteRot(img, pt.x, pt.y + R - sh / 2 - anim.bob, sw, sh, lean, facingLeft, 1, sh / 2);
        } else {
          r.drawCircle(pt.x, pt.y, R, '#7fe6c0');
          r.drawCircle(pt.x, pt.y, R - 4, '#cffaea');
        }
      }
      // Draw shield ring around player while any shield layer remains.
      if (ctx.equip.shield > 0) {
        const pulse = 0.6 + 0.4 * Math.sin(now / 300);
        r.drawRing(pt.x, pt.y, R + 10, `rgba(95,184,255,${pulse * 0.7})`, 2.5);
      }
      // Draw berserk aura while the rage buff is active.
      if ((ctx.equip.buffs.get('berserk') ?? -1) > ctx.time.elapsed) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 100);
        r.drawRing(pt.x, pt.y, R + 14, `rgba(255,60,60,${pulse * 0.5})`, 3);
      }
      if (aim) r.drawCircle(pt.x + aim.x * (R + 8), pt.y + aim.y * (R + 8), 3, '#ffffff');
    }

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
    let bossHp: number | null = null;
    for (const e of w.query(Enemy)) {
      const en = w.get(e, Enemy)!;
      if (en.def.isBoss) {
        const h = w.get(e, Health)!;
        bossHp = h.hp / h.max;
        break;
      }
    }

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
      shield: ctx.equip.shield,
    });
  }
}
