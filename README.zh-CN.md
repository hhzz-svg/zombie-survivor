# 🧟 末日清道夫 · Zombie Survivor

一款快节奏、纯浏览器运行的俯视角丧尸生存 roguelite，使用 TypeScript、Vite、Canvas 2D 和轻量确定性 ECS 从零构建。

[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-fcc72b.svg?logo=vitest&logoColor=white)](https://vitest.dev/)

### [立即游玩](https://zombie-survivor.huz43462.workers.dev/)

[English](README.md) · 简体中文

<img src="docs/screenshots/gameplay-hero.jpg" alt="末日清道夫游戏截图" width="80%" />

---

## 概览

在 5 个递进阶段中守住阵地。每个阶段都会提高丧尸上限和生成压力，最终的母巢暴君会带着预警、环形弹幕、召唤援军和震地冲击波登场。

当前版本始终保持同一个主角形象，不再混用人物变体；成长通过武器、商店道具、技能图标、冷却和特效表达。

## 特色

- 快节奏俯视角战斗 - 武器会自动朝鼠标开火，你只需要专注走位和拉扯。
- 阶段性尸潮压力 - 5 个可见阶段逐步抬高敌人上限和生成密度。
- 确定性 ECS - 实体/组件存储加上种子随机数，已被无头模拟测试覆盖。
- 带技能的 Boss 战 - 母巢暴君会提前预警、发射环形弹幕、召唤援军并震荡战场。
- 商店经济 - 前期用金币购买消耗品，中后期可解锁本局主动技能。
- 质感 Canvas 2D 渲染 - 角色跑动、屏幕震动、命中闪光、冲击波、粒子、弹道、尸体和血迹都已经接入。
- 六种敌人原型 - 行尸、疾跑者、喷吐者、自爆体、壮汉，以及母巢暴君。

## 操作

| 行为 | 输入 |
|---|---|
| 移动 | `W` `A` `S` `D` / 方向键 |
| 瞄准 | 鼠标（自动开火） |
| 使用道具栏 | `Q` `E` `R` |
| 使用主动技能 | `Z` 疾冲 / `X` 冲击爆破 / `C` 能量屏障 / `V` 时间迟滞 |
| 打开商店 | `B` |
| 选择升级 | `1` / `2` / `3` |
| 开始 / 重开 | `Space` |

## 商店与技能

商店前期出售消耗品：手雷、治疗、护盾和临时增益。从第 3 阶段开始，主动技能会进入商店。购买后，本局永久解锁，并在 HUD 中显示冷却槽。

本版本保持统一主角 `player.png`，技能和武器通过图标、子弹、冲击波、冷却和特效表现，不再依赖人物持枪变体。

## 快速开始

```bash
npm install
npm run dev
```

然后打开终端里输出的本地 Vite 地址，默认是 `http://localhost:5173`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器。 |
| `npm run build` | 先类型检查，再输出生产构建到 `dist/`。 |
| `npm run preview` | 本地预览生产构建。 |
| `npm run typecheck` | 执行 `tsc --noEmit`。 |
| `npm test` | 运行 Vitest 测试（单测 + 无头模拟）。 |

## 技术栈

使用 TypeScript、Vite 6、Canvas 2D、Vitest 和 Zod 构建。

```
src/
├── ecs/        实体/组件存储 + 确定性随机数
├── systems/    移动、生成、战斗、武器、拾取、装备、技能
├── render/     Canvas 渲染、资源加载、精灵尺寸
├── data/       数值、敌人、武器、被动、装备、技能定义
├── fx/         粒子、尸体、血迹
├── sim/        无头模拟器（复用真实系统）
├── ui/         DOM 覆盖层（标题、HUD、升级、商店、结算）
└── game.ts     状态机、系统流水线、世界渲染
public/assets/  运行时精灵、技能图标和音频
tests/          核心系统 + 无头模拟测试
```

## 路线图

- [ ] 可选的 GitHub Pages 部署。
- [ ] 后期道具经济数值微调。
- [ ] 如果后续美术到位，再补更丰富的敌人动画。
- [ ] 给持枪精灵补手部锚点的分层表现。

## 许可

[MIT](LICENSE) © 贡献者。`public/assets/` 下的美术与音频资源请遵循 [`public/assets/ASSETS.md`](public/assets/ASSETS.md) 中的说明。
