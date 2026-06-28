import { z } from 'zod';
import { SkillDefSchema, type SkillDef } from './schemas';

const raw = [
  {
    id: 'dash',
    name: '疾冲',
    desc: '向瞄准方向瞬移 160px，并获得 0.25 秒无敌。',
    cost: 32,
    unlockStage: 3,
    cooldown: 8,
    key: 'KeyZ',
    iconKey: 'skill_dash',
  },
  {
    id: 'burst',
    name: '冲击爆破',
    desc: '对周围 190px 内敌人造成 95 伤害并击退。',
    cost: 38,
    unlockStage: 3,
    cooldown: 14,
    key: 'KeyX',
    iconKey: 'skill_burst',
  },
  {
    id: 'barrier',
    name: '能量屏障',
    desc: '获得 3 层临时护盾，持续 10 秒。',
    cost: 42,
    unlockStage: 4,
    cooldown: 22,
    key: 'KeyC',
    iconKey: 'skill_barrier',
  },
  {
    id: 'slow',
    name: '时间迟滞',
    desc: '6 秒内敌人移动和攻击节奏降低 35%。',
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
