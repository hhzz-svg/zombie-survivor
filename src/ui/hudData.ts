import type { GameContext } from '../ctx';
import type { HudData } from './ui';
import {
  RUN_STAGES, currentRunStage, activeSurge, incomingSurge, COMBO_WINDOW,
  WEAPON_SLOTS, PASSIVE_SLOTS,
} from '../data/balance';
import { MAX_WEAPON_LEVEL, evolutionHint, evolutionReady } from '../data/weapons';
import { PASSIVES, passiveById } from '../data/passives';
import { EQUIPMENT } from '../data/equipment';
import { SKILLS } from '../data/skills';
import { skillCooldownRemaining } from '../systems/skills';
import { comboTier } from '../systems/combo';
import { Health, Loadout, Enemy, Wingman } from '../components';
import { primaryWeapon } from '../loadout';

/** Held passives in definition order, so the panel never reshuffles between frames. */
export function passiveList(ctx: GameContext): Array<{ name: string; level: number; trait: boolean }> {
  const out: Array<{ name: string; level: number; trait: boolean }> = [];
  for (const p of PASSIVES) {
    const level = ctx.passives.get(p.id);
    if (level) out.push({ name: p.name, level, trait: p.kind === 'trait' });
  }
  return out;
}

/**
 * The first maxed weapon that is still short of its evolution requirement. Shown so a
 * player holding a finished weapon knows which passive to take next, rather than
 * discovering the pairing by accident.
 */
export function evoHint(ctx: GameContext): string {
  const lo = ctx.world.get(ctx.player, Loadout);
  if (!lo) return '';
  for (const wi of lo.weapons) {
    if (wi.level < MAX_WEAPON_LEVEL) continue;
    if (evolutionReady(wi.def.id, wi.level, ctx.passives, ctx.stats.evoDiscount)) continue;
    const hint = evolutionHint(wi.def.id, ctx.passives, (id) => passiveById(id)?.name ?? id, ctx.stats.evoDiscount);
    if (hint) return hint;
  }
  return '';
}

function threatLabelFor(ctx: GameContext, stage: number): string {
  if (ctx.director.endless) return '威胁：无尽尸潮';
  if (stage >= 5) return '威胁：母巢逼近';
  if (ctx.time.elapsed < 30) return '威胁：低';
  if (stage >= 4) return '威胁：极高';
  if (stage >= 3) return '威胁：高';
  return '威胁：中';
}

/**
 * Read the whole context into one flat HUD snapshot. Pure: it queries the world and
 * returns a value, so the DOM layer stays a dumb renderer of that value and this stays
 * testable without a canvas.
 */
export function buildHudData(ctx: GameContext): HudData {
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
  const primary = primaryWeapon(lo);
  const stageBanner = (ctx.director.stageBannerUntil ?? 0) > ctx.time.elapsed
    ? `阶段 ${stage.index} · ${stage.name}`
    : '';
  const tutorialTip = ctx.time.elapsed < 12
    ? '优先绕圈移动并拾取经验；前 30 秒拾取范围更大'
    : ctx.time.elapsed < 35
      ? '按 B 打开商店，用金币购买装备补足生存能力'
      : '';
  let bossHp: number | null = null;
  let bossName = '';
  for (const e of w.query(Enemy)) {
    const en = w.get(e, Enemy)!;
    if (en.def.isBoss) {
      const h = w.get(e, Health)!;
      bossHp = h.hp / h.max;
      bossName = en.def.name;
      break;
    }
  }
  const threatLabel = bossHp !== null ? 'Boss 接战' : threatLabelFor(ctx, stage.index);

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
  const items: Array<{ def: import('../data/equipment').EquipDef; count: number; remain: number }> = [];
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

  return {
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
    passives: passiveList(ctx),
    slots: {
      weapons: `${lo.weapons.length}/${WEAPON_SLOTS}`,
      passives: `${ctx.passives.size}/${PASSIVE_SLOTS}`,
    },
    evoHint: evoHint(ctx),
    bossHp,
    bossName,
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
  };
}
