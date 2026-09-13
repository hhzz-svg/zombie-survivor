import type { GameContext } from './ctx';
import type { WeaponDef, PassiveDef } from './data/schemas';
import { Loadout, Health } from './components';
import {
  WEAPONS, MAX_WEAPON_LEVEL, evolutionFor, evolutionReady, requiredPassiveLevel,
} from './data/weapons';
import { PASSIVES, passiveById } from './data/passives';
import { WEAPON_SLOTS, PASSIVE_SLOTS, MAX_PASSIVE_LEVEL } from './data/balance';

/** A single level-up offer. */
export type Choice =
  | { kind: 'weapon-new'; weapon: WeaponDef; label: string; desc: string; sprite?: string }
  | { kind: 'weapon-up'; weaponId: string; label: string; desc: string; sprite?: string }
  | { kind: 'weapon-evo'; weaponId: string; evoId: string; label: string; desc: string; sprite?: string }
  | { kind: 'passive'; passive: PassiveDef; label: string; desc: string }
  | { kind: 'passive-up'; passiveId: string; label: string; desc: string }
  | { kind: 'bonus'; bonus: 'hp' | 'gold' | 'shield'; label: string; desc: string };

/** Consolation offers used only when the real pool has run dry (every slot full and maxed). */
const BONUSES: ReadonlyArray<Extract<Choice, { kind: 'bonus' }>> = [
  { kind: 'bonus', bonus: 'hp', label: '战地补给', desc: '+15 最大生命并回满' },
  { kind: 'bonus', bonus: 'gold', label: '赏金', desc: '+40 金币' },
  { kind: 'bonus', bonus: 'shield', label: '备用护盾', desc: '+1 层护盾' },
];

/**
 * Builds three offers under the run's slot limits: new weapons/passives only while a slot is
 * free, upgrades for what is already owned, and — the moment a recipe is satisfied — the
 * evolution card, forced into the first position so it can never be rolled away.
 */
export function makeChoices(ctx: GameContext): Choice[] {
  const lo = ctx.world.get(ctx.player, Loadout)!;
  const owned = new Set(lo.weapons.map((w) => w.def.id));
  const pool: Choice[] = [];
  const forced: Choice[] = [];

  if (lo.weapons.length < WEAPON_SLOTS) {
    for (const id of Object.keys(WEAPONS)) {
      if (id.endsWith('-evo') || owned.has(id)) continue;
      const def = WEAPONS[id]!;
      pool.push({ kind: 'weapon-new', weapon: def, label: `新武器 · ${def.name}`, desc: weaponDesc(def), sprite: def.sprite });
    }
  }

  // Passive ids that would unlock a pending evolution — surfaced on their cards as a nudge.
  const unlocks = new Map<string, string>();
  for (const wi of lo.weapons) {
    const recipe = evolutionFor(wi.def.id);
    if (!recipe) continue;
    if (evolutionReady(wi.def.id, wi.level, ctx.passives, ctx.stats.evoDiscount)) {
      const evoDef = WEAPONS[recipe.evo];
      if (evoDef) {
        forced.push({
          kind: 'weapon-evo',
          weaponId: wi.def.id,
          evoId: recipe.evo,
          label: `${wi.def.name} → ${evoDef.name}`,
          desc: '终极进化！',
          sprite: evoDef.sprite,
        });
      }
    } else if ((ctx.passives.get(recipe.passive) ?? 0) < requiredPassiveLevel(recipe, ctx.stats.evoDiscount)) {
      unlocks.set(recipe.passive, wi.def.name);
    }
  }

  for (const wi of lo.weapons) {
    if (wi.level >= MAX_WEAPON_LEVEL) continue;
    const nearMax = wi.level + 1 === MAX_WEAPON_LEVEL && evolutionFor(wi.def.id);
    pool.push({
      kind: 'weapon-up',
      weaponId: wi.def.id,
      label: `${wi.def.name} Lv.${wi.level}→${wi.level + 1}`,
      desc: nearMax ? '+25% 伤害 · 满级，逼近进化' : '+25% 伤害',
      sprite: wi.def.sprite,
    });
  }

  if (ctx.passives.size < PASSIVE_SLOTS) {
    for (const p of PASSIVES) {
      if (ctx.passives.has(p.id)) continue;
      pool.push({ kind: 'passive', passive: p, label: p.name, desc: withUnlock(p.desc, unlocks.get(p.id)) });
    }
  }
  for (const [id, level] of ctx.passives) {
    if (level >= MAX_PASSIVE_LEVEL) continue;
    const p = passiveById(id);
    if (!p) continue;
    pool.push({
      kind: 'passive-up',
      passiveId: id,
      label: `${p.name} Lv.${level}→${level + 1}`,
      desc: withUnlock(p.desc, unlocks.get(id)),
    });
  }

  const picks: Choice[] = forced.slice(0, 1);
  picks.push(...pickN(ctx, pool, 3 - picks.length));
  for (const b of BONUSES) {
    if (picks.length >= 3) break;
    picks.push(b);
  }
  return picks;
}

function withUnlock(desc: string, weaponName: string | undefined): string {
  return weaponName ? `${desc} · 解锁${weaponName}进化` : desc;
}

function pickN(ctx: GameContext, arr: Choice[], n: number): Choice[] {
  const copy = arr.slice();
  const out: Choice[] = [];
  while (out.length < n && copy.length > 0) {
    const i = Math.floor(ctx.rng() * copy.length);
    out.push(copy.splice(i, 1)[0]!);
  }
  return out;
}

export function applyChoice(ctx: GameContext, c: Choice): void {
  const lo = ctx.world.get(ctx.player, Loadout)!;
  if (c.kind === 'weapon-new') {
    lo.weapons.push({ def: c.weapon, level: 1, cd: 0 });
    if (c.weapon.kind === 'aim') lo.activeWeapon = c.weapon.id;
  } else if (c.kind === 'weapon-up') {
    const wi = lo.weapons.find((w) => w.def.id === c.weaponId);
    if (wi) wi.level++;
  } else if (c.kind === 'weapon-evo') {
    const wi = lo.weapons.find((w) => w.def.id === c.weaponId);
    const evoDef = WEAPONS[c.evoId];
    if (wi && evoDef) {
      const wasHeld = lo.activeWeapon === wi.def.id;
      wi.def = evoDef; // replace the weapon def with the evolved one
      wi.level = 1; // reset level so it can be upgraded again
      if (wasHeld && evoDef.kind === 'aim') lo.activeWeapon = evoDef.id;
      ctx.run.evolved = true;
      ctx.audio.boss(); // dramatic sound
      ctx.screen.shake = Math.max(ctx.screen.shake, 18);
    }
  } else if (c.kind === 'passive') {
    grantPassive(ctx, c.passive);
  } else if (c.kind === 'passive-up') {
    const p = passiveById(c.passiveId);
    if (p) grantPassive(ctx, p);
  } else {
    applyBonus(ctx, c.bonus);
  }
}

/** One level of a passive: bump its level and apply exactly one `amount` step to the stats. */
function grantPassive(ctx: GameContext, p: PassiveDef): void {
  ctx.passives.set(p.id, (ctx.passives.get(p.id) ?? 0) + 1);
  applyPassive(ctx, p);
}

function applyBonus(ctx: GameContext, bonus: 'hp' | 'gold' | 'shield'): void {
  if (bonus === 'gold') {
    ctx.equip.gold += 40;
    return;
  }
  if (bonus === 'shield') {
    ctx.equip.shield += 1;
    return;
  }
  ctx.stats.maxHp += 15;
  const h = ctx.world.get(ctx.player, Health);
  if (h) {
    h.max = ctx.stats.maxHp;
    h.hp = h.max;
  }
}

function applyPassive(ctx: GameContext, p: PassiveDef): void {
  switch (p.stat) {
    case 'damageMul':
      ctx.stats.damageMul += p.amount;
      break;
    case 'fireRateMul':
      ctx.stats.fireRateMul += p.amount;
      break;
    case 'moveSpeed':
      ctx.stats.moveSpeed *= 1 + p.amount;
      break;
    case 'maxHp': {
      ctx.stats.maxHp += p.amount;
      const h = ctx.world.get(ctx.player, Health)!;
      h.max = ctx.stats.maxHp;
      h.hp = Math.min(h.max, h.hp + p.amount);
      break;
    }
    case 'pierce':
      ctx.stats.pierceBonus += p.amount;
      break;
    case 'magnet':
      ctx.stats.magnet += p.amount;
      break;
    case 'projectiles':
      ctx.stats.projectileBonus += p.amount;
      break;
    case 'crit':
      ctx.stats.crit += p.amount;
      break;
    case 'lifesteal':
      ctx.stats.lifesteal += p.amount;
      break;
    case 'detonate':
      ctx.stats.detonate += p.amount;
      break;
    case 'chill':
      ctx.stats.chill += p.amount;
      break;
    case 'desperate':
      ctx.stats.desperate += p.amount;
      break;
  }
}

function weaponDesc(def: WeaponDef): string {
  if (def.kind === 'nova') return `范围冲击 · 伤害 ${def.damage}`;
  return `${def.projectiles > 1 ? `${def.projectiles} 连发 · ` : ''}伤害 ${def.damage}`;
}
