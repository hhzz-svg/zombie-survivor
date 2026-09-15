import type { Renderer } from './renderer';
import { AssetStore } from './assets';
import { enemySpriteSize } from './spriteScale';
import { actorDepth, recoilAmount, walkMotion } from './motion';
import { combatActorPose } from './combatActor';
import { CorpseFX } from '../fx/corpseFX';
import { BloodDecals } from '../fx/bloodDecals';
import type { GameContext } from '../ctx';
import type { Settings } from '../settings';
import { PLAYER_BASE, currentRunStage, activeSurge, SUPPLY_FALL_SECONDS } from '../data/balance';
import { comboTier } from '../systems/combo';
import {
  Transform, Health, Renderable, Enemy, Aim, Loadout, Medkit, Bullet, XPGem, GoldCoin, Velocity,
  Lifetime, SupplyCrate, CurseAltar, Survivor, Wingman, Barrel, Telegraph, Hazard,
} from '../components';
import { obstaclesInRect, type Obstacle } from '../data/obstacles';
import { SURVIVOR_WAIT } from '../data/wingmen';
import { primaryWeapon } from '../loadout';

/** '#rrggbb' → 'r,g,b' for the renderer's edge-glow gradients. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/**
 * Everything the player sees of the world itself: ground, cover, corpses, actors, bullets
 * and the full-screen grading passes.
 *
 * This layer is strictly read-only over `GameContext`. It never advances the simulation, so
 * the frame rate, the sprite atlas and the accessibility settings cannot change how a seeded
 * run plays out — `src/sim/headless.ts` runs the same systems with no renderer at all. The
 * one exception is deliberate and contained: the ground FX buffers (blood, corpses, footstep
 * sparks) live here because nothing reads them back.
 */
export class WorldRenderer {
  private readonly assets = new AssetStore();
  private readonly corpses = new CorpseFX();
  private readonly blood = new BloodDecals();
  private readonly obstacleBuf: Obstacle[] = []; // reused per frame, never allocated in the loop
  private lastFootstep = 0; // player footfall index, to fire step dust exactly on contact

  constructor(private readonly r: Renderer) {}

  /** Sprite atlas load. Drawing degrades to solid shapes until it resolves, so this is fire-and-forget. */
  loadAssets(): Promise<void> {
    return this.assets.load();
  }

  /** Drop every trace of the previous run; called when a new one starts. */
  resetRun(): void {
    this.corpses.clear();
    this.blood.clear();
    this.lastFootstep = 0;
  }

  /** Corpse/afterimage decay. Presentation-only, so it runs off the render clock, not the sim step. */
  update(dt: number): void {
    this.corpses.update(dt);
  }

  spawnCorpse(x: number, y: number, key: string, r: number, isBoss: boolean, flipX: boolean): void {
    this.corpses.spawnCorpse(x, y, key, r, isBoss, flipX);
  }

  spawnAfterimage(x: number, y: number, key: string, r: number, isBoss: boolean, flipX: boolean): void {
    this.corpses.spawnAfter(x, y, key, r, isBoss, flipX);
  }

  splatBlood(x: number, y: number, radius: number): void {
    this.blood.spawn(x, y, radius);
  }

  /**
   * One frame of the world, camera-relative. Called with the live context, or null on the
   * title screen, where only the ground tiles are drawn behind the menu.
   */
  draw(ctx: GameContext | null, settings: Settings): void {
    const r = this.r;
    let camX = 0;
    let camY = 0;
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
      // The simulation always accumulates shake; only the presentation scales it, so the
      // setting can never change how a seeded run plays out.
      const sh = ctx.screen.shake * settings.shake;
      sx = (Math.random() - 0.5) * sh * 2;
      sy = (Math.random() - 0.5) * sh * 2;
      ctx.screen.shake *= 0.86;
      if (ctx.screen.shake < 0.3) ctx.screen.shake = 0;
    }

    r.begin({ x: camX + sx, y: camY + sy });
    this.drawGround(camX, camY, r);
    if (ctx) this.drawObstacleShadows(ctx, r);
    if (ctx) {
      this.blood.draw(r); // blood painted on the ground, never fades
      this.corpses.draw(r, this.assets); // corpses/afterimages sit under the living
      this.drawHazards(ctx, r);
      this.drawTelegraphs(ctx, r);
      this.drawWorld(ctx, r);
      ctx.fx.draw(r);
      const pt = ctx.world.get(ctx.player, Transform);
      if (pt) {
        const pressure = Math.min(1, ctx.world.query(Enemy).length / 180 + currentRunStage(ctx.time.elapsed).index * 0.08);
        r.drawAtmosphere(pt.x, pt.y, pressure);
      }
      // blood-moon storm: pulsing red edges; combo fever: tier-colored glow
      // "Reduce flashing" holds these at a steady low level instead of pulsing them.
      const calm = settings.reduceFlashing;
      const surge = activeSurge(ctx.time.elapsed);
      if (surge) {
        const pulse = calm ? 0.6 : 0.75 + 0.25 * Math.sin(performance.now() / 300);
        r.drawEdgeGlow('255,60,60', (calm ? 0.34 : 0.7) * pulse);
      } else {
        const tier = comboTier(ctx.run.combo.count);
        if (tier.at >= 50) {
          const pulse = calm ? 0.6 : 0.7 + 0.3 * Math.sin(performance.now() / 240);
          r.drawEdgeGlow(hexToRgb(tier.color), (calm ? 0.28 : 0.55) * pulse);
        }
      }
    }
    // low-health vignette drawn in screen space (not world)
    if (ctx) {
      const ph = ctx.world.get(ctx.player, Health);
      if (ph) {
        const hpPct = ph.hp / ctx.stats.maxHp;
        const vig = hpPct < 0.3 ? Math.pow(1 - hpPct / 0.3, 1.8) : 0;
        r.drawVignette(settings.reduceFlashing ? vig * 0.55 : vig);
      }
    }
    r.end();
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

  /** Soft contact shadows, painted on the ground before blood and corpses. */
  private drawObstacleShadows(ctx: GameContext, r: Renderer): void {
    const hw = r.width / 2 + 80;
    const hh = r.height / 2 + 80;
    for (const o of obstaclesInRect(ctx.seed, ctx.camera.x, ctx.camera.y, hw, hh, this.obstacleBuf)) {
      r.drawEllipse(o.x, o.y + o.hh * 0.55, o.hw * 0.98, o.hh * 0.5 + 4, 'rgba(0,0,0,0.3)');
    }
  }

  /** Cover, drawn with the actors so the player is correctly occluded when standing behind it. */
  private pushObstacles(ctx: GameContext, r: Renderer, actors: Array<{ depth: number; draw: () => void }>): void {
    const hw = r.width / 2 + 80;
    const hh = r.height / 2 + 80;
    for (const o of obstaclesInRect(ctx.seed, ctx.camera.x, ctx.camera.y, hw, hh, this.obstacleBuf)) {
      const ob = o;
      actors.push({
        depth: actorDepth(ob.y, ob.hh),
        draw: () => this.drawObstacle(ob, r),
      });
    }
  }

  /**
   * Cover, drawn as stacked slabs: a dark silhouette, a body, a lit top face and a contact
   * line. Placeholder art on purpose — but layered enough to read as volume against the
   * photographic ground rather than as a flat decal.
   */
  private drawObstacle(o: Obstacle, r: Renderer): void {
    const w = o.hw * 2;
    const h = o.hh * 2;
    const lift = Math.min(18, o.hh + 8); // fake height: the body is drawn above its footprint
    const cy = o.y - lift * 0.5;
    const outline = (pad: number, color: string) => r.drawRect(o.x, cy, w + pad, h + pad, color);

    if (o.kind === 'car') {
      outline(5, '#101a1e');
      r.drawRect(o.x, cy, w, h, '#3d4f57');
      r.drawRect(o.x, cy - h * 0.22, w * 0.94, h * 0.3, '#4f6672'); // sun-hit roof
      r.drawRect(o.x, cy - h * 0.1, w * 0.46, h * 0.44, '#1d2b33'); // cabin
      r.drawRect(o.x, cy - h * 0.2, w * 0.4, h * 0.16, '#7fa3ae', 0.55); // glass
      r.drawRect(o.x - w * 0.3, cy + h * 0.45, w * 0.18, 5, '#12181b');
      r.drawRect(o.x + w * 0.3, cy + h * 0.45, w * 0.18, 5, '#12181b');
    } else if (o.kind === 'container') {
      outline(5, '#1a1208');
      r.drawRect(o.x, cy, w, h, '#6b5335');
      r.drawRect(o.x, cy - h * 0.3, w, h * 0.28, '#856a45'); // top face
      for (let i = -3; i <= 3; i++) {
        r.drawRect(o.x + i * (w / 8), cy + h * 0.08, 2, h * 0.7, '#4a3823', 0.75); // corrugation
      }
      r.drawRect(o.x, cy + h * 0.46, w, 3, '#2c2114');
    } else if (o.kind === 'rock') {
      r.drawCircle(o.x, cy + 2, o.hw + 2, '#2a2d28');
      r.drawCircle(o.x, cy, o.hw, '#565b52');
      r.drawCircle(o.x - o.hw * 0.35, cy - o.hw * 0.4, o.hw * 0.55, '#6d7266');
      r.drawCircle(o.x + o.hw * 0.4, cy + o.hw * 0.2, o.hw * 0.42, '#454a42');
    } else {
      outline(5, '#191713');
      r.drawRect(o.x, cy, w, h, '#5a574d');
      r.drawRect(o.x, cy - h * 0.32, w, h * 0.26, '#726e61'); // lit top
      r.drawRect(o.x, cy + h * 0.3, w, h * 0.2, '#3f3d36', 0.8); // shaded base
      r.drawRect(o.x, cy + h * 0.48, w, 3, '#26241f');
    }
  }

  /** Acid pools: ground the player has lost, painted under everything that walks on it. */
  private drawHazards(ctx: GameContext, r: Renderer): void {
    const w = ctx.world;
    const now = performance.now();
    for (const e of w.query(Hazard, Transform)) {
      const h = w.get(e, Hazard)!;
      const t = w.get(e, Transform)!;
      const left = Math.max(0, h.until - ctx.time.elapsed);
      const fade = Math.min(1, left / 1.2); // thins out as it evaporates, so the edge is readable
      const pulse = 0.5 + 0.5 * Math.sin(now / 260 + t.x * 0.05);
      r.drawEllipse(t.x, t.y, h.r, h.r * 0.64, h.color, 0.2 * fade);
      r.drawEllipse(t.x, t.y, h.r * 0.62, h.r * 0.4, h.color, 0.16 * fade);
      r.drawRing(t.x, t.y, h.r, h.color, 2, (0.4 + pulse * 0.25) * fade);
    }
  }

  /**
   * Incoming telegraphed attacks. Drawn on the ground beneath the horde so a wall of bodies
   * can never hide the warning — being readable is the entire point of the mechanic.
   */
  private drawTelegraphs(ctx: GameContext, r: Renderer): void {
    const w = ctx.world;
    for (const e of w.query(Telegraph)) {
      const tg = w.get(e, Telegraph)!;
      const left = Math.max(0, tg.at - ctx.time.elapsed);
      const k = 1 - left / tg.total; // 0 → just started, 1 → landing
      if (tg.kind === 'lash') {
        const st = w.get(e, Transform);
        if (st) {
          r.drawLine(st.x, st.y, tg.x, tg.y, tg.color, 1 + k * 3, 0.3 + k * 0.55);
          r.drawRing(tg.x, tg.y, tg.r * (1.6 - k * 0.6), tg.color, 2, 0.35 + k * 0.5);
        }
        continue;
      }
      r.drawEllipse(tg.x, tg.y, tg.r * k, tg.r * k * 0.62, tg.color, 0.16 + k * 0.16);
      r.drawRing(tg.x, tg.y, tg.r, tg.color, 2.5, 0.45 + k * 0.45);
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
    this.pushObstacles(ctx, r, actors);

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
            const img = this.assets.get(en.def.sprite ?? en.def.id);
            let bodyY = y; // visual centre of the enemy — overlays hang off this, not the collider
            if (img) {
              const size = enemySpriteSize(rd.r, en.def.isBoss);
              const sw = size * (1 + squash);
              const sh = size * (1 - squash);
              bodyY = y + rd.r - sh / 2 - anim.bob;
              r.drawSprite(img, x, bodyY, sw, sh, px - t.x < 0);
              if (showTag) {
                r.drawText(x, y + rd.r - sh - 9, `${en.elite!.name}·${en.def.name}`, en.elite!.color, 11, 'center', 0.92);
              }
            } else {
              r.drawCircle(x, y, rd.r, rd.color);
              if (en.def.isBoss) r.drawRing(x, y, rd.r + 6, '#ffd0e6', 3);
              if (showTag) r.drawText(x, y - rd.r - 10, `${en.elite!.name}·${en.def.name}`, en.elite!.color, 11, 'center', 0.92);
            }
            if (en.def.behavior === 'warden') {
              // The plate the player has to get around — held at chest height, on the side
              // the shield actually blocks, so the weak flank is readable at a glance.
              const sx2 = x + en.faceX * (rd.r + 5);
              const sy2 = bodyY + en.faceY * (rd.r + 5) * 0.6;
              const px2 = -en.faceY;
              const py2 = en.faceX * 0.72; // squashed along y to match the tilted view
              const half = rd.r * 1.15;
              r.drawLine(sx2 - px2 * half, sy2 - py2 * half, sx2 + px2 * half, sy2 + py2 * half, '#0f151c', 9, 0.55);
              r.drawLine(sx2 - px2 * half, sy2 - py2 * half, sx2 + px2 * half, sy2 + py2 * half, '#c3d6ea', 6, 0.95);
              r.drawLine(sx2 - px2 * half * 0.7, sy2 - py2 * half * 0.7, sx2 + px2 * half * 0.7, sy2 + py2 * half * 0.7, '#5d6f85', 2, 0.9);
            } else if (en.def.behavior === 'brood') {
              const pulse2 = 0.5 + 0.5 * Math.sin(now / 260 + t.x * 0.05);
              r.drawRing(x, y + rd.r * 0.5, rd.r + 5 + pulse2 * 4, `rgba(199,155,240,${0.4 - pulse2 * 0.16})`, 2);
              r.drawGlowCircle(x, bodyY, 3 + pulse2 * 2.5, '#f0e2ff', '#9a6fc3');
            }
            const h = w.get(e, Health);
            // Flash on the BODY, not the collider: on big sprites the old placement put a
            // pale disc on the ground beside the enemy.
            if (h && h.flash > 0) r.drawCircle(x, bodyY, rd.r, '#ffffff', 0.45);
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
      } else if (w.has(e, Barrel)) {
        const bar = w.get(e, Barrel)!;
        actors.push({
          depth: actorDepth(t.y, 14),
          draw: () => {
            const lit = bar.fuse > 0;
            const blink = lit ? 0.5 + 0.5 * Math.sin(now / 55) : 0;
            r.drawEllipse(t.x, t.y + 12, 13, 5, 'rgba(0,0,0,0.34)');
            r.drawRect(t.x, t.y, 20, 26, lit ? '#e0762f' : '#9c4f22');
            r.drawRect(t.x, t.y - 6, 20, 3, '#c8b273', 0.7);
            r.drawRect(t.x, t.y + 6, 20, 3, '#c8b273', 0.7);
            r.drawRing(t.x, t.y, 13, '#1b0f08', 1.5, 0.6);
            if (lit) {
              r.drawGlowCircle(t.x, t.y - 16, 3 + blink * 3, '#fff3d6', '#ff9b35');
              r.drawRing(t.x, t.y, 18 + blink * 8, `rgba(255,155,53,${0.6 - blink * 0.35})`, 2);
            }
          },
        });
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
            ctx.fx.spark(pt.x + back * R * 0.5, pt.y + R * 0.85, back, -0.35, 4, '#9a8f72', 70);
          }
          r.drawEllipse(pt.x, pt.y + R * 0.75, R * (0.95 - anim.squash * 0.5), R * 0.4, 'rgba(0,0,0,0.32)');
          const flick = ph.invuln > 0 && Math.floor(ctx.time.elapsed * 20) % 2 === 0;
          if (!flick) {
            const activeWeapon = lo ? primaryWeapon(lo) : undefined;
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
}
