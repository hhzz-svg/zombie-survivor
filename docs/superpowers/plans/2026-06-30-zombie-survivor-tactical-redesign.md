# Zombie Survivor Tactical Pseudo-3D Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 Canvas 2D 丧尸生存游戏改造成清晰、统一、具有战术伪 3D 深度和更好首局反馈的完整可玩版本。

**Architecture:** 保留 ECS、固定步长模拟和 DOM HUD。玩法节奏放进可测试的纯函数与固定系统，视觉姿态放进独立渲染辅助模块，`Game` 只负责编排 Canvas 和 UI；缺失的装备图标作为真实 PNG 资产接入现有 `AssetStore`。

**Tech Stack:** TypeScript 5.6、Vite 6、Vitest、Canvas 2D、自研 ECS、DOM/CSS、内置 ImageGen。

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/runFlow.ts` | 首局刷怪倍率、拾取倍率、阶段奖励和阶段横幅状态 |
| `src/render/motion.ts` | 可测试的深度键、走跑姿态、射击后坐和敌人前扑计算 |
| `src/render/renderer.ts` | 新增屏幕空间环境色调绘制契约 |
| `src/render/canvas2d.ts` | Canvas 2D 环境渐变、局部灯光和危险暗角实现 |
| `src/data/balance.ts` | 首局时间常量和阶段配置 |
| `src/data/equipment.ts` | 装备图标从 Emoji 改为 `iconKey` |
| `src/systems/spawn.ts` | 应用首局刷怪渐进倍率 |
| `src/systems/player.ts` | 应用首局拾取辅助倍率 |
| `src/systems/pipeline.ts` | 固定步长运行阶段流系统 |
| `src/systems/combat.ts` | 上报玩家受伤原因，补强击杀反馈 |
| `src/systems/enemyAI.ts` | 为远程弹、爆炸和 Boss 攻击传递受伤原因 |
| `src/game.ts` | 分层渲染、演员深度排序、HUD 数据、阶段与结算编排 |
| `src/ui/ui.ts` | 新 HUD、开始、升级、商店、阶段横幅和结算界面 |
| `public/assets/*.png` | 八个统一战术装备图标 |
| `public/assets/manifest.json` | 注册新增图片 |
| `public/assets/ASSETS.md` | 记录图标规格与来源 |
| `tests/runFlow.test.ts` | 首局节奏和阶段奖励测试 |
| `tests/motion.test.ts` | 深度与姿态计算测试 |
| `tests/equipment.test.ts` | 所有装备必须拥有图片图标键 |
| `docs/screenshots/*.png` | 改造后的浏览器验收截图 |

---

### Task 1: Make early-run pacing and stage rewards deterministic

**Files:**
- Create: `src/runFlow.ts`
- Create: `tests/runFlow.test.ts`
- Modify: `src/ctx.ts`
- Modify: `src/data/balance.ts`
- Modify: `src/systems/spawn.ts`
- Modify: `src/systems/player.ts`
- Modify: `src/systems/pipeline.ts`

- [ ] **Step 1: Write the failing run-flow tests**

Create `tests/runFlow.test.ts` with the exact public behavior:

```ts
import { describe, expect, it } from 'vitest';
import {
  introSpawnMultiplier,
  pickupRangeMultiplier,
  stageRewardFor,
} from '../src/runFlow';

describe('run flow', () => {
  it('ramps early spawn pressure without changing later stages', () => {
    expect(introSpawnMultiplier(0)).toBeCloseTo(0.5);
    expect(introSpawnMultiplier(10)).toBeCloseTo(0.75);
    expect(introSpawnMultiplier(20)).toBe(1);
    expect(introSpawnMultiplier(120)).toBe(1);
  });

  it('temporarily expands pickup range during onboarding', () => {
    expect(pickupRangeMultiplier(0, 0)).toBeCloseTo(1.75);
    expect(pickupRangeMultiplier(29.9, 0.4)).toBeCloseTo(2.45);
    expect(pickupRangeMultiplier(30, 0.4)).toBeCloseTo(1.4);
  });

  it('grants one readable reward at each later stage', () => {
    expect(stageRewardFor(1)).toEqual({ gold: 0, heal: 0 });
    expect(stageRewardFor(2)).toEqual({ gold: 10, heal: 10 });
    expect(stageRewardFor(5)).toEqual({ gold: 16, heal: 10 });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```bash
npx vitest run tests/runFlow.test.ts
```

Expected: FAIL with `Cannot find module '../src/runFlow'`.

- [ ] **Step 3: Add the minimal run-flow implementation**

Create `src/runFlow.ts`:

```ts
import type { GameContext } from './ctx';
import { Health } from './components';
import { currentRunStage } from './data/balance';

export const INTRO_RAMP_SECONDS = 20;
export const INTRO_PICKUP_SECONDS = 30;

export function introSpawnMultiplier(elapsed: number): number {
  if (elapsed >= INTRO_RAMP_SECONDS) return 1;
  return 0.5 + 0.5 * Math.max(0, elapsed) / INTRO_RAMP_SECONDS;
}

export function pickupRangeMultiplier(elapsed: number, magnet: number): number {
  const onboarding = elapsed < INTRO_PICKUP_SECONDS ? 1.75 : 1;
  return (1 + magnet) * onboarding;
}

export function stageRewardFor(stageIndex: number): { gold: number; heal: number } {
  return stageIndex <= 1 ? { gold: 0, heal: 0 } : { gold: 6 + stageIndex * 2, heal: 10 };
}

export function runFlowSystem(ctx: GameContext): void {
  const stage = currentRunStage(ctx.time.elapsed);
  const previous = ctx.director.stageIndex ?? 1;
  if (stage.index <= previous) return;
  ctx.director.stageIndex = stage.index;
  ctx.director.stageBannerUntil = ctx.time.elapsed + 1.5;
  const reward = stageRewardFor(stage.index);
  ctx.equip.gold += reward.gold;
  const health = ctx.world.get(ctx.player, Health);
  if (health) health.hp = Math.min(health.max, health.hp + reward.heal);
}
```

Extend `Director` in `src/ctx.ts` with optional fields so existing fixtures remain valid:

```ts
stageIndex?: number;
stageBannerUntil?: number;
```

Use `introSpawnMultiplier(ctx.time.elapsed)` in the budget accrual expression in `src/systems/spawn.ts`. Replace the pickup range expression in `src/systems/player.ts` with:

```ts
const range = PLAYER_BASE.pickupRange * pickupRangeMultiplier(ctx.time.elapsed, ctx.stats.magnet);
```

Call `runFlowSystem(ctx)` immediately after incrementing `ctx.time.elapsed` in `runSystems`.

- [ ] **Step 4: Run focused and existing director/simulation tests**

Run:

```bash
npx vitest run tests/runFlow.test.ts tests/director.test.ts tests/sim.test.ts
```

Expected: all tests PASS; fixed seeds remain deterministic.

- [ ] **Step 5: Commit the deterministic pacing slice**

```bash
git add src/runFlow.ts src/ctx.ts src/data/balance.ts src/systems/spawn.ts src/systems/player.ts src/systems/pipeline.ts tests/runFlow.test.ts
git commit -m "feat: improve early run pacing"
```

---

### Task 2: Replace shop emoji with a unified image asset set

**Files:**
- Modify: `src/data/equipment.ts`
- Modify: `src/ui/ui.ts`
- Modify: `public/assets/manifest.json`
- Modify: `public/assets/ASSETS.md`
- Modify: `tests/equipment.test.ts`
- Create: `public/assets/equip_magnet.png`
- Create: `public/assets/equip_grenade.png`
- Create: `public/assets/equip_medkit.png`
- Create: `public/assets/equip_shield.png`
- Create: `public/assets/equip_boots.png`
- Create: `public/assets/equip_berserk.png`
- Create: `public/assets/equip_coin_double.png`
- Create: `public/assets/equip_death_dance.png`

- [ ] **Step 1: Add a failing equipment asset contract test**

Append to `tests/equipment.test.ts`:

```ts
import { EQUIPMENT } from '../src/data/equipment';

describe('equipment presentation', () => {
  it('uses a unique image asset for every shop item', () => {
    const keys = EQUIPMENT.map((item) => item.iconKey);
    expect(keys.every((key) => key.startsWith('equip_'))).toBe(true);
    expect(new Set(keys).size).toBe(EQUIPMENT.length);
  });
});
```

- [ ] **Step 2: Run the test and verify the type/data failure**

Run:

```bash
npx vitest run tests/equipment.test.ts
```

Expected: FAIL because `EquipDef` has no `iconKey`.

- [ ] **Step 3: Generate eight independent icon sources**

Use built-in ImageGen once per item. Attach `docs/design/2026-06-30-tactical-redesign/selected-direction.png` as the style reference and reuse this prompt template, substituting the subject and accent:

```text
Use case: stylized-concept
Asset type: 96×96 browser-game equipment icon
Primary request: one isolated <SUBJECT> for a tactical apocalypse survivor game
Style: pre-rendered 2.5D inventory icon, dark graphite metal, crisp silhouette, subtle wear
Lighting: warm amber function light with restrained teal edge light
Composition: centered single object, generous padding, no floor plane
Background: perfectly flat solid #00ff00 chroma-key background
Constraints: no text, no logo, no watermark, no cast shadow, do not use #00ff00 on the object
```

Subjects: magnetic field module, fragmentation grenade, trauma medkit, shield generator, armored running boot, red combat stimulant vial, stacked coin multiplier module, skull-marked overdrive injector.

Run the installed chroma removal helper on each generated source, then resize with Pillow to 96×96 RGBA. Validate transparent corners and non-empty alpha coverage before copying into `public/assets/`.

- [ ] **Step 4: Change the equipment data and DOM rendering**

Replace `icon: string` with `iconKey: string` in `EquipDef`. Use the filenames above without `.png`. In `UI.showShop`, replace the equipment branch with:

```ts
const icon = `<img src="/assets/${def.iconKey}.png" alt="">`;
```

Add all eight keys to `manifest.json` and document them in `ASSETS.md`.

- [ ] **Step 5: Verify assets and data**

Run:

```bash
npx vitest run tests/equipment.test.ts
npm run build
```

Expected: equipment tests PASS; TypeScript and Vite build PASS; each new file is 96×96 RGBA PNG.

- [ ] **Step 6: Commit the asset slice**

```bash
git add src/data/equipment.ts src/ui/ui.ts tests/equipment.test.ts public/assets/manifest.json public/assets/ASSETS.md public/assets/equip_*.png
git commit -m "feat: add tactical equipment icons"
```

---

### Task 3: Build the tactical HUD and overlay hierarchy

**Files:**
- Modify: `src/ui/ui.ts`
- Modify: `src/game.ts`

- [ ] **Step 1: Extend `HudData` with explicit view data**

Add these fields in `src/ui/ui.ts` rather than recomputing them in the DOM layer:

```ts
stageProgress: number;
nextStageIn: number | null;
threatLabel: string;
primaryWeapon: { name: string; level: number; progress: number };
tutorialTip: string;
stageBanner: string;
```

In `Game.updateHud`, derive stage progress from the current and next `RUN_STAGES` entry, derive `stageBanner` while `director.stageBannerUntil > elapsed`, and select the active weapon from `Loadout`.

- [ ] **Step 2: Replace the HUD markup once, preserving element ownership**

Construct the following stable IDs in the `UI` constructor:

```html
<div id="ui-xp"><i></i></div>
<div id="ui-mission"><span id="ui-stage"></span><strong id="ui-time"></strong><span id="ui-threat"></span></div>
<div id="ui-economy"><span id="ui-gold"></span><button id="ui-shopbtn">[B] 商店</button></div>
<div id="ui-stage-banner"></div>
<div id="ui-tutorial"></div>
<div id="ui-hpwrap"><div id="ui-hp"><i></i></div><div id="ui-hplabel"></div></div>
<div id="ui-items"></div>
<div id="ui-weapon-primary"></div>
<div id="ui-weapons"></div>
<div id="ui-boss"><div class="t"></div><i></i></div>
```

Use buttons for clickable controls and keep the root `pointer-events:none`, enabling pointer events only on controls.

- [ ] **Step 3: Apply the selected visual system in CSS**

Define CSS custom properties at `#ui-hud`:

```css
--surface:rgba(7,14,13,.88);--surface-2:rgba(12,24,22,.82);
--growth:#61e5de;--fire:#ffb438;--danger:#ff5a4f;--boss:#e56aa8;
--text:#eff7f4;--muted:#9ab1aa;--line:rgba(138,216,194,.22);
```

Use 16px as the key numerical baseline, 52px inventory slots, 320px HP width, `focus-visible` outlines, and a `@media (max-width:900px)` rule that hides only the secondary weapon list.

- [ ] **Step 4: Redesign the title, level-up, shop and end screens**

Keep existing callbacks and state transitions. Change only presentation and the `showEnd` input shape:

```ts
export interface RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  best: number;
  stage: number;
  primaryWeapon: string;
  gold: number;
  cause: string;
  nextGoal: string;
}
```

Shop cards must show category, image, name, short description, cost, `还差 N 金币` when unavailable, held state and shortcut. Level-up cards must show `当前 → 下一等级` when the label contains an upgrade.

- [ ] **Step 5: Type-check the DOM refactor**

Run:

```bash
npm run typecheck
```

Expected: PASS with no missing element or `HudData` field errors.

- [ ] **Step 6: Commit the UI hierarchy**

```bash
git add src/ui/ui.ts src/game.ts
git commit -m "feat: redesign tactical game ui"
```

---

### Task 4: Add pseudo-3D depth and procedural actor motion

**Files:**
- Create: `src/render/motion.ts`
- Create: `tests/motion.test.ts`
- Modify: `src/render/spriteScale.ts`
- Modify: `src/game.ts`

- [ ] **Step 1: Write failing motion tests**

Create `tests/motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { actorDepth, recoilAmount, walkMotion } from '../src/render/motion';

describe('actor motion', () => {
  it('sorts actors by their feet, not sprite center', () => {
    expect(actorDepth(100, 20)).toBe(120);
    expect(actorDepth(110, 5)).toBe(115);
  });

  it('keeps idle actors still and moving actors readable', () => {
    expect(walkMotion(1000, 0, 0, 1)).toEqual({ bob: 0, squash: 0, rock: 0, step: 0 });
    expect(Math.abs(walkMotion(1000, 120, 0, 1).bob)).toBeGreaterThan(0);
  });

  it('decays weapon kick across a cooldown', () => {
    expect(recoilAmount(0.22, 0.22)).toBeCloseTo(1);
    expect(recoilAmount(0.11, 0.22)).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

```bash
npx vitest run tests/motion.test.ts
```

Expected: FAIL with missing `src/render/motion.ts`.

- [ ] **Step 3: Extract and extend the pure motion helpers**

Move the existing `walkAnim` math from `game.ts` into `walkMotion` in `src/render/motion.ts`. Export:

```ts
export function actorDepth(y: number, radius: number): number {
  return y + radius;
}

export function recoilAmount(cooldown: number, period: number): number {
  if (period <= 0) return 0;
  const phase = cooldown / period;
  return phase > 0.75 ? (phase - 0.75) / 0.25 : 0;
}
```

Keep `walkMotion` output identical to the existing `{ bob, squash, rock, step }` contract.

- [ ] **Step 4: Refactor `drawWorld` into three ordered passes**

1. Draw ground pickups and medkits.
2. Build enemy actor entries plus the player entry, sort by `actorDepth`, and draw them.
3. Draw bullets, orbit blades and high-frequency FX above actors.

Increase `playerSpriteSize` from `playerR * 5.4` to `playerR * 6.6`; increase non-Boss enemies from `5.0` to `5.5`, keeping colliders unchanged.

For motion:

```ts
const recoil = activeWeapon ? recoilAmount(activeWeapon.cd, activeWeapon.def.cooldown) : 0;
const lean = baseLean - recoil * 0.055 * (facingLeft ? -1 : 1);
```

Enemy attack lunge is render-only: when distance to the player is below `radius + PLAYER_BASE.radius + 24`, offset the sprite up to 5px toward the player and increase vertical squash by at most 0.04.

- [ ] **Step 5: Run motion and sprite regression tests**

```bash
npx vitest run tests/motion.test.ts tests/playerWeaponSprite.test.ts
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the pseudo-3D actor pass**

```bash
git add src/render/motion.ts src/render/spriteScale.ts src/game.ts tests/motion.test.ts
git commit -m "feat: add pseudo-3d actor depth"
```

---

### Task 5: Strengthen screen grading, combat feedback and run summary

**Files:**
- Modify: `src/render/renderer.ts`
- Modify: `src/render/canvas2d.ts`
- Modify: `src/fx/fx.ts`
- Modify: `src/ctx.ts`
- Modify: `src/systems/combat.ts`
- Modify: `src/systems/enemyAI.ts`
- Modify: `src/systems/player.ts`
- Modify: `src/game.ts`

- [ ] **Step 1: Add the minimal renderer contract**

Add to `Renderer`:

```ts
drawAtmosphere(playerX: number, playerY: number, intensity?: number): void;
```

Implement it in `Canvas2DRenderer` as one radial warm light centered on the player followed by a low-opacity screen-edge blue-black gradient. Reset to screen coordinates inside the method and restore the context. Do not loop entities and do not allocate an offscreen canvas.

- [ ] **Step 2: Add pickup streaks without a new particle type**

Add `FX.streak(x1, y1, x2, y2, color)` backed by a small pooled line record with a maximum life of 0.18 seconds. Add this explicit primitive to `Renderer` and `Canvas2DRenderer`:

```ts
drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width?: number, alpha?: number): void;
```

The Canvas implementation uses one stroked path with round caps and no `shadowBlur`; `FX.draw` passes the remaining-life ratio as alpha.

Spawn a streak only when an XP gem or coin crosses the collection radius, not every magnet frame.

- [ ] **Step 3: Record the last damage cause through an optional visual hook**

Extend `VfxHooks`:

```ts
onPlayerHit?: (cause: string) => void;
```

Change `damagePlayer` to:

```ts
export function damagePlayer(ctx: GameContext, dmg: number, cause = '感染者近身攻击'): void
```

Call `ctx.vfx?.onPlayerHit?.(cause)` only when damage reaches HP after shields and invulnerability checks. Pass specific causes from contact, enemy projectile, exploder and Boss slam calls.

- [ ] **Step 4: Build the end summary from live state**

Track `lastDamageCause` in `Game`, reset it on `start`, and update it from the VFX hook. Pass the `RunSummary` object from Task 3 to `showEnd`. Compute `nextGoal` with a small private method:

```ts
private nextGoal(stage: number, weaponLevel: number): string {
  if (stage < 2) return '下一目标：抵达第 2 阶段';
  if (weaponLevel < 3) return '下一目标：将主武器升到 Lv.3';
  return '下一目标：击败母巢暴君';
}
```

- [ ] **Step 5: Run all automated tests and build**

```bash
npm test
npm run build
```

Expected: complete Vitest suite PASS; production build PASS.

- [ ] **Step 6: Commit combat presentation**

```bash
git add src/render/renderer.ts src/render/canvas2d.ts src/fx/fx.ts src/ctx.ts src/systems/combat.ts src/systems/enemyAI.ts src/systems/player.ts src/game.ts
git commit -m "feat: strengthen combat presentation"
```

---

### Task 6: Browser playtest the complete experience and fix visible regressions

**Files:**
- Modify: `src/ui/ui.ts`
- Modify: `src/game.ts`
- Modify: `src/render/canvas2d.ts`
- Create: `docs/screenshots/tactical-title.png`
- Create: `docs/screenshots/tactical-gameplay.png`
- Create: `docs/screenshots/tactical-shop.png`
- Create: `docs/screenshots/tactical-defeat.png`

- [ ] **Step 1: Start the local game and open it in the in-app Browser**

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 4173
```

Use the existing in-app Browser at its default 1280×720 viewport. Do not switch to standalone Playwright.

- [ ] **Step 2: Capture and inspect the four core states**

Capture title, active gameplay after at least one kill, shop, and defeat. Reject any screenshot with loading, wrong state, clipped panels or unreadable text. Verify:

- player is visually larger than the old screenshot;
- stage/time/threat are readable without merging into one line;
- HP and skills remain visible at 1280×720;
- shop cards fit without a browser-style scrollbar at 1280×720;
- equipment icons are real assets, not Emoji;
- focus-visible is present on Start, Shop, Close and cards;
- no console errors appear.

- [ ] **Step 3: Check the 900px responsive boundary**

Temporarily set the in-app Browser viewport to 900×720, reload, and verify the secondary weapon list hides while HP, stage, shop and skill controls remain readable. Reset the viewport afterward.

- [ ] **Step 4: Compare the implementation to both visual sources**

Place `docs/design/2026-06-30-tactical-redesign/selected-direction.png` beside `docs/screenshots/tactical-gameplay.png` in one comparison view. Check hierarchy, actor scale, amber/teal/red language, shadow depth, spacing, border radii and font weight. Apply only targeted fixes in the three listed source files.

- [ ] **Step 5: Re-run automated verification after visual fixes**

```bash
npm test
npm run build
git diff --check
```

Expected: tests PASS, build PASS, no whitespace errors.

- [ ] **Step 6: Commit browser-tested polish**

```bash
git add src/ui/ui.ts src/game.ts src/render/canvas2d.ts docs/screenshots/tactical-*.png
git commit -m "fix: polish tactical redesign"
```

---

### Task 7: Update product documentation, progress log, and release evidence

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `progress.md`

- [ ] **Step 1: Update public game documentation**

Replace the README hero screenshot with `docs/screenshots/tactical-gameplay.png`. Describe the new tactical HUD, early-run guidance, stage rewards, real equipment icons, actor motion and pseudo-3D depth without mentioning internal design files or work logs.

- [ ] **Step 2: Append the implementation record to `progress.md`**

Use the required format and include:

- business outcomes rather than a file-by-file narrative in `What was done`;
- exact `npm test`, `npm run build`, browser states and responsive viewport evidence in `Testing`;
- every modified/created file in `Notes` with one-line purpose;
- rollback point: the commit before the first implementation commit.

- [ ] **Step 3: Run the completion audit**

Verify each design-spec success criterion against code, tests, screenshots and rendered behavior. Treat the item as incomplete if evidence is indirect. Then run:

```bash
npm test
npm run build
git status --short --branch
git log --oneline --decorate -8
```

Expected: tests/build PASS; only intended documentation changes remain before the final commit.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md README.zh-CN.md progress.md
git commit -m "docs: document tactical redesign"
```

- [ ] **Step 5: Push the feature branch**

```bash
git push -u origin codex/tactical-pseudo3d-redesign
```

Expected: push succeeds and `origin/codex/tactical-pseudo3d-redesign` points at the final commit.

---

## Completion evidence matrix

| Requirement | Authoritative evidence |
| --- | --- |
| UI improvement | 1280×720 title/game/shop/defeat screenshots and DOM behavior |
| Effects | live browser capture plus `src/fx/fx.ts` and renderer implementation |
| Gameplay logic | `tests/runFlow.test.ts`, director/sim tests and 30-second playtest |
| Images | eight 96×96 RGBA files, manifest entries and shop rendering |
| Character actions | `tests/motion.test.ts` plus gameplay screenshot/observation |
| Pseudo-3D | depth-sort helper test, actor overlap observation, shadows and screen grade |
| Research and plan | Figma audit, research report, approved visual target, design spec and this plan |
| GitHub sync | successful push and remote branch verification |

## Execution mode

The user asked to continue without further decision prompts. Execute this plan inline with `superpowers:executing-plans`, preserving the listed checkpoints and commits.
