<div align="center">

# 🧟 Zombie Survivor · 末日清道夫

**A fast, browser-based top-down zombie-survivor roguelite — built from scratch with TypeScript, Vite, Canvas 2D, and a tiny deterministic ECS.**

[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-fcc72b.svg?logo=vitest&logoColor=white)](https://vitest.dev/)

### [▶ Play Now](https://zombie-survivor.huz43462.workers.dev/)

**English** · [简体中文](README.zh-CN.md)

<img src="docs/screenshots/gameplay-hero.jpg" alt="Zombie Survivor gameplay" width="80%" />

</div>

---

## Overview

Hold the line against an ever-growing horde. Move, auto-fire at the cursor, vacuum up XP, draft upgrades, spend gold on consumables between waves, and survive long enough to bring down the **Hive Tyrant** boss.

The whole simulation runs on a small custom ECS that is fully deterministic — the same systems power both the live game and a headless test harness, so balance can be verified in CI without a browser.

## ✨ Highlights

- ⚡ **Fast top-down combat** — weapons fire automatically toward the mouse; you focus on positioning and kiting.
- 🧬 **Deterministic ECS** — entity/component storage + a seeded RNG, exercised by a headless simulation in tests.
- 🔫 **Deep build crafting** — 12 weapons, passives, and weapon evolutions drafted from level-up choices.
- 🛒 **Consumable economy** — gold is a renewable resource: buy charges, timed potions, and stacking shields between fights.
- 🎨 **Juicy Canvas 2D renderer** — sprite art, procedural run cycle, screen shake, hit flashes, particles, tracers, corpses, and blood decals.
- 🧟 **Six enemy archetypes** — Walker, Runner, Spitter, Exploder, Brute, and the Hive Tyrant boss.

## 🎮 Controls

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` / Arrow keys |
| Aim | Mouse (auto-fire) |
| Use item slots | `Q` `E` `R` |
| Open shop | `B` |
| Pick a level-up | `1` / `2` / `3` |
| Start / restart | `Space` |

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Then open the local Vite URL printed in the terminal (defaults to `http://localhost:5173`).

## 🛠️ Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Type-check, then build the production bundle to `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm test` | Run the Vitest suite (unit + headless simulation). |

## 📦 Tech & Layout

Built with **TypeScript**, **Vite 6**, **Canvas 2D**, **Vitest**, and **Zod** for schema validation — no game engine, no runtime UI framework.

```
src/
├─ ecs/        entity/component storage + seeded deterministic RNG
├─ systems/    movement, spawning, combat, weapons, pickups, equipment
├─ render/     Canvas renderer, asset loading, sprite sizing
├─ data/       balance, enemies, weapons, passives, equipment definitions
├─ fx/         particles, corpses, blood decals
├─ sim/        headless simulation harness (shares the live systems)
├─ ui/         DOM overlay (title, HUD, level-up, shop, game-over)
└─ game.ts     state machine, system pipeline, world rendering
public/assets/ runtime sprites & audio
tests/         Vitest coverage for core systems + headless sim
```

## 🗺️ Roadmap

- [ ] Optional GitHub Pages deployment for instant play.
- [ ] Late-game item-economy balance tuning.
- [ ] Richer per-enemy animation if new art lands.
- [ ] Layered held-weapon sprites with hand anchors.

## 📄 License

[MIT](LICENSE) © contributors. Art and audio assets under `public/assets/` follow the notes in [`public/assets/ASSETS.md`](public/assets/ASSETS.md).

