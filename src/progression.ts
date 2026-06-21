import type { GameContext } from './ctx';
import type { WeaponDef, PassiveDef } from './data/schemas';
import { Loadout, Health } from './components';
import { WEAPONS, MAX_WEAPON_LEVEL, EVOLUTIONS } from './data/weapons';
import { PASSIVES } from './data/passives';

/** A single level-up offer. */
export type Choice =
  | { kind: 'weapon-new'; weapon: WeaponDef; label: string; desc: string; sprite?: string }
  | { kind: 'weapon-up'; weaponId: string; label: string; desc: string; sprite?: string }
  | { kind: 'weapon-evo'; weaponId: string; evoId: string; label: string; desc: string; sprite?: string }
  | { kind: 'passive'; passive: PassiveDef; label: string; desc: string };

/** Builds three distinct random offers from new weapons / weapon upgrades / passives. */
export function makeChoices(ctx: GameContext): Choice[] {
  const lo = ctx.world.get(ctx.player, Loadout)!;
  const owned = new Set(lo.weapons.map((w) => w.def.id));
  const pool: Choice[] = [];

  for (const id of Object.keys(WEAPONS)) {
    if (!owned.has(id)) {
      const def = WEAPONS[id]!;
      pool.push({ kind: 'weapon-new', weapon: def, label: `新武器 · ${def.name}`, desc: weaponDesc(def), sprite: def.sprite });
    }
  }
  for (const wi of lo.weapons) {
    if (wi.level < MAX_WEAPON_LEVEL) {
      pool.push({
        kind: 'weapon-up',
        weaponId: wi.def.id,
        label: `${wi.def.name} Lv.${wi.level}→${wi.level + 1}`,
        desc: '+25% 伤害',
        sprite: wi.def.sprite,
      });
    } else if (wi.level === MAX_WEAPON_LEVEL) {
      // Max level — offer evolution if available and not already evolved
      const evoId = EVOLUTIONS[wi.def.id];
      if (evoId && !wi.def.id.endsWith('-evo')) {
        const evoDef = WEAPONS[evoId];
        if (evoDef) {
          pool.push({
            kind: 'weapon-evo',
            weaponId: wi.def.id,
            evoId,
            label: `${wi.def.name} → ${evoDef.name}`,
            desc: '终极进化！',
            sprite: evoDef.sprite,
          });
        }
      }
    }
  }
  for (const p of PASSIVES) {
    pool.push({ kind: 'passive', passive: p, label: p.name, desc: p.desc });
  }

  return pickN(ctx, pool, 3);
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
      ctx.audio.boss(); // dramatic sound
      ctx.screen.shake = Math.max(ctx.screen.shake, 18);
    }
  } else {
    applyPassive(ctx, c.passive);
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
  }
}

function weaponDesc(def: WeaponDef): string {
  if (def.kind === 'nova') return `范围冲击 · 伤害 ${def.damage}`;
  return `${def.projectiles > 1 ? `${def.projectiles} 连发 · ` : ''}伤害 ${def.damage}`;
}
