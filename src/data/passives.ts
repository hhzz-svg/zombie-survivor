import { z } from 'zod';
import { PassiveDefSchema, type PassiveDef } from './schemas';

export const PASSIVES: PassiveDef[] = z.array(PassiveDefSchema).parse([
  { id: 'pow',    name: '高能弹头', desc: '+20% 伤害',    stat: 'damageMul',   amount: 0.2 },
  { id: 'rof',    name: '快速循环', desc: '+18% 攻速',    stat: 'fireRateMul', amount: 0.18 },
  { id: 'legs',   name: '轻量护具', desc: '+12% 移速',    stat: 'moveSpeed',   amount: 0.12 },
  { id: 'vest',   name: '防弹背心', desc: '+25 最大生命', stat: 'maxHp',       amount: 25 },
  { id: 'ap',     name: '穿甲弹',   desc: '+1 穿透',      stat: 'pierce',      amount: 1 },
  { id: 'magnet', name: '磁能拾取', desc: '+40% 拾取范围', stat: 'magnet',      amount: 0.4 },
  { id: 'multi',  name: '多重射击', desc: '+1 弹丸',      stat: 'projectiles', amount: 1 },
  { id: 'crit',   name: '暴击',     desc: '+10% 暴击率',  stat: 'crit',        amount: 0.1 },
  { id: 'vamp',   name: '嗜血',     desc: '击杀回 2 生命', stat: 'lifesteal',   amount: 2 },
]);
