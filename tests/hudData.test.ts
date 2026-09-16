import { describe, it, expect } from 'vitest';
import { makeCtx } from './helpers';
import { buildHudData, evoHint, passiveList } from '../src/ui/hudData';
import { primaryWeapon } from '../src/loadout';
import { WEAPONS, MAX_WEAPON_LEVEL, EVOLUTIONS } from '../src/data/weapons';
import { WEAPON_SLOTS, PASSIVE_SLOTS } from '../src/data/balance';
import { PASSIVES } from '../src/data/passives';
import { ENEMIES } from '../src/data/enemies';
import { EQUIPMENT } from '../src/data/equipment';
import { spawnEnemyAt } from '../src/factory';
import { Loadout, Health } from '../src/components';
import type { GameContext } from '../src/ctx';

function loadout(ctx: GameContext) {
  return ctx.world.get(ctx.player, Loadout)!;
}

// The whole point of lifting the HUD out of Game was that it stops needing a canvas, a DOM
// and a live run to exercise. These are the assertions that were impossible before.
describe('buildHudData', () => {
  it('reads the live context into a flat snapshot', () => {
    const ctx = makeCtx();
    ctx.time.elapsed = 42;
    ctx.stats.kills = 17;
    ctx.equip.gold = 250;
    ctx.world.get(ctx.player, Health)!.hp = 61;

    const d = buildHudData(ctx);
    expect(d.time).toBe(42);
    expect(d.kills).toBe(17);
    expect(d.gold).toBe(250);
    expect(d.hp).toBe(61);
    expect(d.maxHp).toBe(ctx.stats.maxHp);
    expect(d.level).toBe(ctx.stats.level);
  });

  it('reports slot occupancy against the caps, not raw counts', () => {
    const ctx = makeCtx();
    loadout(ctx).weapons.push({ def: WEAPONS.shotgun, level: 1, cd: 0 });
    ctx.passives.set('rof', 2);
    ctx.passives.set('crit', 1);

    const d = buildHudData(ctx);
    expect(d.slots.weapons).toBe(`2/${WEAPON_SLOTS}`);
    expect(d.slots.passives).toBe(`2/${PASSIVE_SLOTS}`);
    expect(d.weapons).toEqual([
      { name: WEAPONS.pistol.name, level: 1 },
      { name: WEAPONS.shotgun.name, level: 1 },
    ]);
  });

  it('names the primary weapon and its progress toward max level', () => {
    const ctx = makeCtx();
    const lo = loadout(ctx);
    lo.weapons.push({ def: WEAPONS.magnum, level: 3, cd: 0 });
    lo.activeWeapon = 'magnum';

    const d = buildHudData(ctx);
    expect(d.primaryWeapon.name).toBe(WEAPONS.magnum.name);
    expect(d.primaryWeapon.level).toBe(3);
    expect(d.primaryWeapon.progress).toBeCloseTo(3 / MAX_WEAPON_LEVEL);
  });

  it('switches the threat line to the boss and exposes its health bar', () => {
    const ctx = makeCtx();
    const plain = buildHudData(ctx);
    expect(plain.bossHp).toBeNull();
    expect(plain.threatLabel).not.toBe('Boss 接战');

    const boss = Object.values(ENEMIES).find((e) => e.isBoss)!;
    const e = spawnEnemyAt(ctx, boss, 300, 0);
    const h = ctx.world.get(e, Health)!;
    h.hp = h.max / 4;

    const d = buildHudData(ctx);
    expect(d.threatLabel).toBe('Boss 接战');
    expect(d.bossName).toBe(boss.name);
    expect(d.bossHp).toBeCloseTo(0.25);
  });

  it('lists only consumables actually held, and buffs only while they last', () => {
    const ctx = makeCtx();
    expect(buildHudData(ctx).items).toEqual([]);

    const charge = EQUIPMENT.find((eq) => eq.kind === 'charge')!;
    const buff = EQUIPMENT.find((eq) => eq.kind !== 'charge' && eq.kind !== 'shield')!;
    ctx.equip.charges.set(charge.id, 2);
    ctx.equip.buffs.set(buff.id, 5);
    ctx.time.elapsed = 4;
    expect(buildHudData(ctx).items.map((i) => i.def.id).sort()).toEqual([buff.id, charge.id].sort());

    ctx.time.elapsed = 6; // buff expired
    expect(buildHudData(ctx).items.map((i) => i.def.id)).toEqual([charge.id]);
  });
});

describe('passiveList', () => {
  it('keeps definition order and marks the gameplay traits', () => {
    const ctx = makeCtx();
    const [first, second] = PASSIVES;
    ctx.passives.set(second.id, 2);
    ctx.passives.set(first.id, 1);

    const list = passiveList(ctx);
    expect(list.map((p) => p.name)).toEqual([first.name, second.name]);
    expect(list[1].level).toBe(2);
    for (const p of list) expect(typeof p.trait).toBe('boolean');
  });
});

describe('evoHint', () => {
  it('is silent until a weapon is maxed, then names the missing passive', () => {
    const ctx = makeCtx();
    const recipe = EVOLUTIONS.shotgun;
    const lo = loadout(ctx);
    lo.weapons.push({ def: WEAPONS.shotgun, level: 1, cd: 0 });
    expect(evoHint(ctx)).toBe('');

    lo.weapons[1].level = MAX_WEAPON_LEVEL;
    const hint = evoHint(ctx);
    expect(hint).not.toBe('');

    ctx.passives.set(recipe.passive, recipe.passiveLevel);
    expect(evoHint(ctx)).toBe(''); // requirement met — nothing left to hint at
  });
});

describe('primaryWeapon', () => {
  it('prefers the held weapon, then any aimed gun, then slot 0', () => {
    const orbit = { def: WEAPONS.orbit, level: 1, cd: 0 };
    const smg = { def: WEAPONS.smg, level: 1, cd: 0 };
    const magnum = { def: WEAPONS.magnum, level: 1, cd: 0 };

    expect(primaryWeapon({ weapons: [orbit, smg, magnum], activeWeapon: 'magnum' })).toBe(magnum);
    expect(primaryWeapon({ weapons: [orbit, smg, magnum] })).toBe(smg);
    expect(primaryWeapon({ weapons: [orbit] })).toBe(orbit);
  });
});
