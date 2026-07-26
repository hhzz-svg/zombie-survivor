import type { GameContext } from '../ctx';
import { Transform, SupplyCrate, XPGem, GoldCoin, Loadout, Health } from '../components';
import { SUPPLY_FIRST_AT, SUPPLY_INTERVAL, SUPPLY_PICKUP_RADIUS } from '../data/balance';
import { MAX_WEAPON_LEVEL } from '../data/weapons';
import { spawnCrate } from '../factory';
import { collectXp } from './player';
import { startBuff } from './equipment';

/**
 * Supply drops: on a fixed cadence a crate parachutes in near the player.
 * Once landed it can be collected by proximity for one weighted-random reward.
 * The reveal ceremony (toast, FX) is the point — rewards reuse existing systems.
 */

export interface CrateReward {
  id: 'gold' | 'vacuum' | 'heal' | 'ammo' | 'weaponUp' | 'shieldCell';
  name: string;
  weight: number;
}

export const CRATE_REWARDS: readonly CrateReward[] = [
  { id: 'gold', name: '军费储备', weight: 22 },
  { id: 'vacuum', name: '全域磁暴', weight: 14 },
  { id: 'heal', name: '战地医疗箱', weight: 16 },
  { id: 'ammo', name: '强化弹药', weight: 16 },
  { id: 'weaponUp', name: '武器改装件', weight: 20 },
  { id: 'shieldCell', name: '护盾电池', weight: 12 },
];

export function rollCrateReward(rng: () => number): CrateReward {
  const total = CRATE_REWARDS.reduce((a, r) => a + r.weight, 0);
  let roll = rng() * total;
  for (const r of CRATE_REWARDS) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return CRATE_REWARDS[CRATE_REWARDS.length - 1]!;
}

export function supplyDropSystem(ctx: GameContext, _dt: number): void {
  const d = ctx.director;
  if (d.nextDropAt === undefined) d.nextDropAt = SUPPLY_FIRST_AT;

  if (ctx.time.elapsed >= d.nextDropAt) {
    d.nextDropAt += SUPPLY_INTERVAL;
    const pt = ctx.world.get(ctx.player, Transform);
    if (pt) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 150 + ctx.rng() * 110;
      const x = pt.x + Math.cos(a) * r;
      const y = pt.y + Math.sin(a) * r;
      spawnCrate(ctx, x, y);
      ctx.fx.shockwave(x, y, 46, '#ffd166', 0.5);
      ctx.fx.text(x, y - 26, '空投抵达', '#ffd166', 15);
      ctx.audio.pickup();
    }
  }

  const pt = ctx.world.get(ctx.player, Transform);
  if (!pt) return;
  for (const e of ctx.world.query(SupplyCrate, Transform)) {
    const sc = ctx.world.get(e, SupplyCrate)!;
    const t = ctx.world.get(e, Transform)!;
    if (ctx.time.elapsed < sc.landAt) continue; // still on the parachute
    const d2 = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2;
    if (d2 <= SUPPLY_PICKUP_RADIUS * SUPPLY_PICKUP_RADIUS) {
      openCrate(ctx, t.x, t.y);
      ctx.world.destroy(e);
    }
  }
}

function openCrate(ctx: GameContext, x: number, y: number): void {
  ctx.run.cratesOpened++;
  const reward = rollCrateReward(ctx.rng);
  const desc = applyCrateReward(ctx, reward.id);
  ctx.fx.burst(x, y, 22, '#ffd166', 260, ctx.rng);
  ctx.fx.flash(x, y, 30, '#fff6dd', '#ffd166', 0.2);
  ctx.fx.shockwave(x, y, 90, '#ffd166', 0.4);
  ctx.fx.text(x, y - 30, reward.name, '#ffe66a', 17);
  ctx.screen.shake = Math.max(ctx.screen.shake, 5);
  ctx.audio.levelUp();
  ctx.vfx?.onSupplyReward?.(reward.name, desc);
}

/** Apply a reward by id; returns the human-readable summary for the toast. */
export function applyCrateReward(ctx: GameContext, id: CrateReward['id']): string {
  switch (id) {
    case 'gold': {
      const amount = 30 + Math.floor(ctx.rng() * 21);
      ctx.equip.gold += amount;
      return `获得 ${amount} 金币`;
    }
    case 'vacuum': {
      // Pull every gem and coin on the field into the player instantly.
      const pt = ctx.world.get(ctx.player, Transform);
      let gems = 0;
      let coins = 0;
      for (const e of ctx.world.query(XPGem, Transform)) {
        const t = ctx.world.get(e, Transform)!;
        if (pt) ctx.fx.streak(t.x, t.y, pt.x, pt.y, '#7fdcff');
        gems += ctx.world.get(e, XPGem)!.value;
        ctx.world.destroy(e);
      }
      for (const e of ctx.world.query(GoldCoin, Transform)) {
        const t = ctx.world.get(e, Transform)!;
        if (pt) ctx.fx.streak(t.x, t.y, pt.x, pt.y, '#ffd66a');
        coins += ctx.world.get(e, GoldCoin)!.value;
        ctx.world.destroy(e);
      }
      if (gems > 0) collectXp(ctx, gems);
      ctx.equip.gold += coins;
      ctx.audio.pickup();
      return `吸取全场掉落：${gems} 经验 · ${coins} 金币`;
    }
    case 'heal': {
      const h = ctx.world.get(ctx.player, Health);
      if (h) h.hp = Math.min(h.max, h.hp + 50);
      return '回复 50 生命';
    }
    case 'ammo':
      startBuff(ctx, 'supplyAmmo', 30);
      return '30 秒内伤害 +18%';
    case 'weaponUp': {
      const lo = ctx.world.get(ctx.player, Loadout);
      const upgradable = lo?.weapons.filter((w) => w.level < MAX_WEAPON_LEVEL) ?? [];
      if (upgradable.length === 0) {
        ctx.equip.gold += 25;
        return '武器已全部满级，折算 25 金币';
      }
      const wi = upgradable[Math.floor(ctx.rng() * upgradable.length)]!;
      wi.level++;
      return `${wi.def.name} 升至 Lv.${wi.level}`;
    }
    case 'shieldCell':
      ctx.equip.shield++;
      return '获得 1 层护盾';
  }
}
