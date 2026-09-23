import { z } from 'zod';
import { SkillDefSchema, type SkillDef } from './schemas';
import { tr } from '../i18n';

const raw = [
  {
    id: 'dash',
    name: tr('疾冲', 'Dash'),
    desc: tr('向瞄准方向瞬移 160px，并获得 0.25 秒无敌。', 'Blink 160px toward your aim with 0.25s of invulnerability.'),
    cost: 32,
    unlockStage: 3,
    cooldown: 8,
    key: 'KeyZ',
    iconKey: 'skill_dash',
  },
  {
    id: 'burst',
    name: tr('冲击爆破', 'Shockblast'),
    desc: tr('对周围 190px 内敌人造成 95 伤害并击退。', 'Deal 95 damage and knock back everything within 190px.'),
    cost: 38,
    unlockStage: 3,
    cooldown: 14,
    key: 'KeyX',
    iconKey: 'skill_burst',
  },
  {
    id: 'barrier',
    name: tr('能量屏障', 'Barrier'),
    desc: tr('获得 3 层临时护盾，持续 10 秒。', 'Gain 3 layers of temporary shield for 10 seconds.'),
    cost: 42,
    unlockStage: 4,
    cooldown: 22,
    key: 'KeyC',
    iconKey: 'skill_barrier',
  },
  {
    id: 'slow',
    name: tr('时间迟滞', 'Time Warp'),
    desc: tr('6 秒内敌人移动和攻击节奏降低 35%。', 'Enemies move and attack 35% slower for 6 seconds.'),
    cost: 46,
    unlockStage: 4,
    cooldown: 28,
    key: 'KeyV',
    iconKey: 'skill_slow',
  },
];

export const SKILLS: SkillDef[] = z.array(SkillDefSchema).parse(raw);

export function skillById(id: string): SkillDef | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

export function availableSkillsForStage(stageIndex: number, owned: Set<string>): SkillDef[] {
  return SKILLS.filter((skill) => skill.unlockStage <= stageIndex && !owned.has(skill.id));
}
