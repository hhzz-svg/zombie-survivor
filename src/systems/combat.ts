import type { GameContext } from '../ctx';
import type { Entity } from '../ecs/world';
import { Transform, Health, Enemy, Barrel } from '../components';
import { igniteBarrel } from './collision';
import { spawnGem, spawnMedkit, spawnCoin, spawnEnemyBullet } from '../factory';
import { COIN_DROP, DEATH_DANCE_CAP } from '../data/equipment';
import { activeSurge, SURGE_GOLD_MUL, ENDLESS_BOSS_INTERVAL } from '../data/balance';
import { TOXIC_DEATH_BOLTS } from '../data/elites';
import { WARDEN_ARC_COS, WARDEN_FRONT_MUL } from '../data/enemies';
import { buffActive } from './equipment';
import { addComboKill, comboGoldMul, comboPitch, resetCombo } from './combo';
import { curseGoldMul } from './curse';
import { barrierAbsorb } from './skills';
import { CHILL_CAP, CHILL_SECONDS, DETONATE_DAMAGE, DETONATE_RADIUS } from '../data/passives';

/** Shared damage resolution — used by bullets, nova, and explosions so the rules live in one place. */

/**
 * @param grantIFrames pass false for damage-over-time. A hazard that granted the usual 0.6s of
 * immunity would protect the player from the horde for half the time they stood in it — the
 * opposite of a denial mechanic.
 */
export function damagePlayer(
  ctx: GameContext,
  dmg: number,
  cause = '感染者近身攻击',
  grantIFrames = true,
): void {
  const h = ctx.world.get(ctx.player, Health)!;
  if (h.invuln > 0 || h.hp <= 0) return;
  if (barrierAbsorb(ctx)) return;
  // Shield absorbs one hit completely, consuming one stacked layer.
  if (ctx.equip.shield > 0) {
    ctx.equip.shield--;
    const pt = ctx.world.get(ctx.player, Transform);
    if (pt) {
      ctx.fx.burst(pt.x, pt.y, 14, '#5fb8ff', 200, ctx.rng);
      ctx.fx.flash(pt.x, pt.y, 22, '#ffffff', '#5fb8ff', 0.18);
    }
    ctx.audio.pickup();
    return;
  }
  h.hp -= dmg;
  if (grantIFrames) h.invuln = 0.6;
  h.flash = 0.2;
  resetCombo(ctx); // real HP damage breaks the kill chain
  if (ctx.run.firstHpHitAt === null) ctx.run.firstHpHitAt = ctx.time.elapsed;
  ctx.time.hitStop = Math.max(ctx.time.hitStop, 55);
  ctx.screen.shake = Math.max(ctx.screen.shake, 9);
  ctx.audio.hurt();
  ctx.vfx?.onPlayerHit?.(cause);
  if (h.hp <= 0) {
    // Revive protocol (a permanent talent): get back up once, right where you fell.
    if (ctx.run.revivesLeft > 0) {
      ctx.run.revivesLeft--;
      h.hp = Math.max(1, Math.round(h.max * 0.5));
      h.invuln = Math.max(h.invuln, 2);
      const pt = ctx.world.get(ctx.player, Transform);
      if (pt) {
        knockBackAround(ctx, pt.x, pt.y, 260, 320);
        ctx.fx.shockwave(pt.x, pt.y, 260, '#61e5de', 0.55);
        ctx.fx.flash(pt.x, pt.y, 54, '#eafffb', '#61e5de', 0.26);
        ctx.fx.text(pt.x, pt.y - 34, '复活协议！', '#61e5de', 20);
      }
      ctx.time.hitStop = Math.max(ctx.time.hitStop, 90);
      ctx.screen.shake = Math.max(ctx.screen.shake, 16);
      ctx.audio.levelUp();
      ctx.vfx?.onAnnounce?.('复活协议', '倒下时原地复活 · 回复 50% 生命 · 2 秒无敌', 'adrenaline');
      return;
    }
    h.hp = 0;
    ctx.events.onDeath();
    return;
  }
  // Adrenaline surge: dipping under 20% HP buys the player a comeback.
  if (ctx.run.adrenalineLeft > 0 && h.hp < ctx.stats.maxHp * 0.2) {
    ctx.run.adrenalineLeft--;
    h.hp = Math.min(h.max, h.hp + 15);
    h.invuln = Math.max(h.invuln, 1.5);
    const pt = ctx.world.get(ctx.player, Transform);
    if (pt) {
      knockBackAround(ctx, pt.x, pt.y, 220, 320);
      ctx.fx.shockwave(pt.x, pt.y, 220, '#ffd166', 0.5);
      ctx.fx.flash(pt.x, pt.y, 46, '#fff6dd', '#ffb43c', 0.22);
      ctx.fx.burst(pt.x, pt.y, 30, '#ffd166', 320, ctx.rng);
      ctx.fx.text(pt.x, pt.y - 34, '肾上腺素！', '#ffd166', 20);
    }
    ctx.time.hitStop = Math.max(ctx.time.hitStop, 70);
    ctx.screen.shake = Math.max(ctx.screen.shake, 14);
    ctx.audio.levelUp();
    ctx.vfx?.onAnnounce?.('肾上腺素爆发', '+15 生命 · 1.5 秒无敌 · 击退周围尸群（每局一次）', 'adrenaline');
  }
}

/** Shove (and lightly hurt) everything around a point — the comeback saves both use it. */
function knockBackAround(ctx: GameContext, x: number, y: number, radius: number, push: number): void {
  const neigh: number[] = [];
  ctx.hash.query(x, y, radius, neigh);
  for (const o of neigh) {
    const ot = ctx.world.get(o, Transform);
    if (!ot) continue;
    const d = Math.hypot(ot.x - x, ot.y - y) || 1;
    if (d <= radius) damageEnemy(ctx, o, 12, (ot.x - x) / d, (ot.y - y) / d, push);
  }
}

export function damageEnemy(
  ctx: GameContext,
  e: Entity,
  dmg: number,
  dx: number,
  dy: number,
  knock: number,
  crit = false,
  quiet = false, // suppress the damage number (rapid-fire streams like the flamer)
): void {
  const h = ctx.world.get(e, Health);
  const t = ctx.world.get(e, Transform);
  if (!h || !t || h.hp <= 0) return;

  // Warden shields: fire inside the frontal arc mostly bounces. The shield swings slowly
  // (see WARDEN_TURN_RATE), so the answer is to get around it — through the horde.
  const en0 = ctx.world.get(e, Enemy);
  if (en0 && en0.def.behavior === 'warden' && dx * en0.faceX + dy * en0.faceY < WARDEN_ARC_COS) {
    dmg *= WARDEN_FRONT_MUL;
    ctx.fx.spark(t.x + en0.faceX * 14, t.y + en0.faceY * 14, -dx, -dy, 4, '#cfe0f2', 220, ctx.rng);
    if (!quiet) ctx.fx.text(t.x, t.y - 16, '挡下', '#9fb6cf', 12);
    quiet = true; // the blocked number is noise; the "挡下" tag already says it
  }

  h.hp -= dmg;
  h.flash = 0.08;
  // Barrels share the enemy damage path (so every weapon and blast hits them for free) but
  // take no knockback, pop no damage numbers, and detonate instead of dying.
  if (ctx.world.get(e, Barrel)) {
    if (h.hp <= 0) igniteBarrel(ctx, e);
    return;
  }
  // `chill` trait: every hit re-applies the slow, so sustained fire keeps the horde crawling.
  if (ctx.stats.chill > 0) {
    const en = ctx.world.get(e, Enemy);
    if (en) {
      en.chillMul = 1 - Math.min(CHILL_CAP, ctx.stats.chill);
      en.chillUntil = ctx.time.elapsed + CHILL_SECONDS;
    }
  }
  if (crit) {
    // crits pop: bigger type scaled by how hard the hit was
    const size = Math.min(24, 16 + dmg / 30);
    ctx.fx.text(t.x, t.y - 14, String(Math.round(dmg)) + '!', '#ff5252', size);
    ctx.fx.flash(t.x, t.y, 12, '#fff3b0', '#ff8a3c', 0.08);
  } else if (!quiet) {
    const size = Math.min(19, 12 + dmg / 40);
    ctx.fx.text(t.x, t.y - 12, String(Math.round(dmg)), '#ffd86c', size);
  }
  // directional impact sparks fly off in the bullet's travel direction
  ctx.fx.spark(t.x, t.y, dx, dy, crit ? 7 : 4, '#ffcf8a', 200, ctx.rng);
  if (knock) {
    t.x += dx * knock * 0.02;
    t.y += dy * knock * 0.02;
    // hard hits leave a translucent recoil afterimage of the sprite
    if (ctx.vfx && knock >= 120) {
      const en = ctx.world.get(e, Enemy);
      const pt = ctx.world.get(ctx.player, Transform);
      if (en && pt) ctx.vfx.onEnemyKnocked(t.x, t.y, en.def.id, en.def.radius, en.def.isBoss, pt.x - t.x < 0);
    }
  }
  if (h.hp <= 0) killEnemy(ctx, e);
}

export function killEnemy(ctx: GameContext, e: Entity): void {
  const en = ctx.world.get(e, Enemy);
  const t = ctx.world.get(e, Transform);
  if (!en || !t) return;
  const def = en.def;
  const elite = en.elite;
  const x = t.x;
  const y = t.y;
  ctx.stats.kills++;
  addComboKill(ctx);
  if (ctx.vfx) {
    const pt = ctx.world.get(ctx.player, Transform);
    ctx.vfx.onEnemyKilled(x, y, def.id, def.radius, def.isBoss, pt ? pt.x - x < 0 : false);
    ctx.vfx.onBloodSplat(x, y, def.radius);
  }
  ctx.world.destroy(e); // remove BEFORE any explosion so it can't re-hit itself
  // `detonate` trait: corpses cook off, chaining through packed crowds. Never hurts the player.
  if (ctx.stats.detonate > 0 && ctx.rng() < ctx.stats.detonate) {
    explode(ctx, x, y, DETONATE_RADIUS, DETONATE_DAMAGE, false);
    ctx.fx.shockwave(x, y, DETONATE_RADIUS, '#9ef06f', 0.28);
  }
  spawnGem(ctx, x, y, def.xp * (elite?.xpMul ?? 1));

  // Gold coin drop with ±20% jitter; elites, surges, combo tiers, and curse stacks multiply it.
  const baseCoins = COIN_DROP[def.id] ?? 2;
  const coinMul = (buffActive(ctx, 'coinDouble') ? 2 : 1)
    * (elite?.goldMul ?? 1)
    * (activeSurge(ctx.time.elapsed) ? SURGE_GOLD_MUL : 1)
    * comboGoldMul(ctx)
    * curseGoldMul(ctx);
  const coins = Math.max(1, Math.round(baseCoins * (0.8 + ctx.rng() * 0.4) * coinMul));
  spawnCoin(ctx, x, y, coins);

  if (ctx.stats.lifesteal > 0) {
    const ph = ctx.world.get(ctx.player, Health);
    if (ph) ph.hp = Math.min(ph.max, ph.hp + ctx.stats.lifesteal);
  }
  // Death-dance: while the buff is active, +5% damage per kill, capped at 10 stacks (50%).
  if (buffActive(ctx, 'deathDance') && ctx.equip.deathDanceStacks < DEATH_DANCE_CAP) {
    ctx.equip.deathDanceStacks++;
    ctx.stats.damageMul += 0.05;
  }
  if (!def.isBoss && ctx.rng() < 0.035) spawnMedkit(ctx, x, y, 20);
  ctx.fx.burst(x, y, 10, def.color, 170, ctx.rng);
  ctx.audio.kill(comboPitch(ctx));
  if (def.behavior === 'exploder') explode(ctx, x, y, 72, 30);

  if (elite) {
    ctx.run.elitesKilled++;
    ctx.time.hitStop = Math.max(ctx.time.hitStop, 30);
    ctx.screen.shake = Math.max(ctx.screen.shake, 7);
    ctx.fx.shockwave(x, y, 60, elite.color, 0.35);
    ctx.fx.burst(x, y, 18, elite.color, 240, ctx.rng);
    ctx.fx.text(x, y - 24, `精英击破`, elite.color, 16);
    if (elite.id === 'toxic') {
      // Toxic elites release a ring of acid bolts on death — reposition, then punish.
      for (let i = 0; i < TOXIC_DEATH_BOLTS; i++) {
        const a = (i / TOXIC_DEATH_BOLTS) * Math.PI * 2;
        spawnEnemyBullet(ctx, x, y, Math.cos(a), Math.sin(a));
      }
    }
  }

  if (def.behavior === 'golden') {
    ctx.run.goldenKilled++;
    // The golden runner erupts into a coin fountain instead of a normal drop.
    for (let i = 0; i < 10; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 14 + ctx.rng() * 46;
      spawnCoin(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 5 + Math.floor(ctx.rng() * 4));
    }
    ctx.fx.shockwave(x, y, 80, '#ffd700', 0.45);
    ctx.fx.burst(x, y, 26, '#ffe66a', 300, ctx.rng);
    ctx.fx.text(x, y - 26, '黄金收割！', '#ffd700', 18);
    ctx.audio.levelUp();
  }

  if (def.isBoss) {
    if (ctx.director.endless) {
      // Endless: the tyrant is a recurring paycheck, not a run-ender.
      ctx.run.tyrantsSlain++;
      ctx.equip.gold += 150;
      const ph = ctx.world.get(ctx.player, Health);
      if (ph) ph.hp = Math.min(ph.max, ph.hp + 40);
      ctx.director.nextBossAt = ctx.time.elapsed + ENDLESS_BOSS_INTERVAL;
      ctx.fx.shockwave(x, y, 160, '#ffd0e6', 0.6);
      ctx.fx.text(x, y - 40, `暴君再临倒计时 ${ENDLESS_BOSS_INTERVAL}s`, '#e56aa8', 16);
      ctx.audio.boss();
    } else {
      ctx.director.bossDead = true;
      ctx.events.onVictory();
    }
  }
}

export function explode(
  ctx: GameContext,
  x: number,
  y: number,
  radius: number,
  dmg: number,
  hurtPlayer = true,
  cause = '爆裂感染者自爆',
): void {
  const neigh: number[] = [];
  ctx.hash.query(x, y, radius, neigh);
  for (const o of neigh) {
    const ot = ctx.world.get(o, Transform);
    const oh = ctx.world.get(o, Health);
    if (!ot || !oh) continue;
    const d = Math.hypot(ot.x - x, ot.y - y);
    if (d <= radius) damageEnemy(ctx, o, dmg, (ot.x - x) / (d || 1), (ot.y - y) / (d || 1), 80);
  }
  if (hurtPlayer) {
    const pt = ctx.world.get(ctx.player, Transform)!;
    if (Math.hypot(pt.x - x, pt.y - y) <= radius + 14) damagePlayer(ctx, dmg, cause);
  }
  ctx.fx.burst(x, y, 16, '#ffb060', 240, ctx.rng);
  ctx.screen.shake = Math.max(ctx.screen.shake, 6);
  ctx.audio.explode();
}
