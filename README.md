# 🧟 Zombie Survivor · 末日清道夫

A fast, browser-based top-down zombie survivor. Outrun the horde, auto-fire into the swarm, and build a run that can survive long enough to take down the Hive Tyrant. Runs entirely in the browser — no install, no account, just click and play.

[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)

<p align="center">
  <img src="docs/images/zombie-survivor-poster.png" alt="Zombie Survivor poster" width="720">
</p>

### ▶ [Play Now](https://zombie-survivor.pages.dev/)

[English](README.md) · [简体中文](README.zh-CN.md)

---

## What it is

Pick an operative and get dropped into an open arena with a starting gun and a rising tide of the dead. Your gun fires on its own toward the cursor, so the whole game lives in your feet: kite the swarm, keep the kill chain alive, race for supply drops, chase the golden runner. Every few levels you pick one of three upgrades, and the build you stitch together decides whether you make it to the boss — and how far you get in the endless horde after it.

It starts as a cleanup job. It ends with hundreds of zombies on screen and a boss that summons its own.

## Why it's fun

- **Three playable operatives.** Ranger (fire rate), Juggernaut (HP over speed), Hunter (crit glass cannon) — different starting weapons and stats, different openings.
- **Kill chains are multipliers.** Kills within a 4-second window stack into tiers — 连击 → 杀戮 → 狂热 → 灭世 — multiplying XP and gold as you climb. One real hit breaks the chain. The riskier your kiting, the faster you snowball.
- **Elite mutations.** Swift / Mighty / Toxic affix elites roll in over time with auras, name tags, and multiplied rewards; Toxic ones burst into a ring of acid on death. See a glow, plan before you dive.
- **Supply drops and blood moons bend the run.** A crate parachutes in every 42 seconds (gold / field-wide vacuum / weapon upgrade / shield cell… six rewards, revealed on open); blood moons hit on a schedule — ×2.3 spawns, +12% enemy speed, +60% gold. The screen turns red, and those seconds are both the danger and the payday.
- **The golden runner.** A glowing target that flees at full sprint. Catch it for a fountain of coins; miss it and it's gone — a chase scene about once a minute.
- **Eight weapons, each with an evolution.** Pistol, shotgun, SMG, magnum, nova, orbit blades — plus the flamethrower (close-range fire hose) and the rocket launcher (splash damage). Max a weapon to unlock its ultimate form.
- **Auto-fire, all movement.** No reloading, no aiming clicks — your attention goes entirely into positioning and crowd control. Easy to start, hard to master.
- **A boss with a kit — and it doesn't end there.** The Hive Tyrant volleys, slams, and summons. Beat it and you can enter the **endless horde**: the Tyrant returns every 110 seconds, tougher each cycle, with blood moons on rotation. See how far you get.
- **Active skills you actually pilot.** Dash through a pack, burst the room, pop a barrier, or slow time. Bought from the shop mid-run, mapped to `Z` `X` `C` `V` with live cooldown slots.
- **It feels good to play.** Scaled damage numbers, a combo counter with fever-glow screen edges, parachuting crates with reward toasts, blood-moon tint, screen shake, hit flashes, corpses and blood decals — all on plain Canvas 2D, all running smooth with a crowded screen.

## Enemies

| | |
|---|---|
| **Walker** | The baseline shambler. Slow, relentless, always more. |
| **Runner** | Closes distance fast — punishes lazy spacing. |
| **Spitter** | Ranged acid; forces you to keep moving. |
| **Exploder** | Rushes in and detonates. Pop it early or pay for it. |
| **Brute** | A wall of HP that shrugs off knockback. |
| **Elite mutations** | Swift / Mighty / Toxic affixes with auras and name tags. Multiplied rewards; Toxic bursts acid on death. |
| **Golden runner** | Never attacks, only flees. Kill it before it escapes for a coin fountain. |
| **Hive Tyrant** | The boss. Volleys, slams, and summons — survive it to win, then dare the endless horde. |

## Controls

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` / Arrow keys |
| Aim | Mouse (fires automatically) |
| Use item slots | `Q` `E` `R` |
| Active skills | `Z` Dash · `X` Burst · `C` Barrier · `V` Time Slow |
| Open shop | `B` |
| Pick a level-up | `1` / `2` / `3` |
| Pick operative / start / restart | Click + `Space` |
| Enter endless mode after victory | `E` or the on-screen button |

## The shop

Kills drop gold. Press `B` any time to spend it. Early on the shop stocks consumables — grenades, healing, shields, timed buffs. From Stage 3 the active-skill cards unlock; buy one and it's yours for the rest of the run, with its cooldown shown on the HUD.

## Run it locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints (defaults to `http://localhost:5173`).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload. |
| `npm run build` | Type-check, then build to `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the test suite (unit + a headless game simulation). |

## Built with

TypeScript and Vite, rendered on Canvas 2D, with a small custom ECS at its core. The simulation is deterministic — a seeded RNG plus entity/component storage — which lets a headless harness replay full runs in tests without a browser. Game data (enemies, weapons, skills) is validated with Zod schemas at load time.

```
src/
├── ecs/        entity/component storage + seeded deterministic RNG
├── systems/    movement, spawning, combat, weapons, pickups, equipment, skills, combo, supply drops
├── render/     Canvas renderer, asset loading, sprite sizing
├── data/       balance, enemies, weapons, passives, equipment, skills, elites, operatives
├── fx/         particles, corpses, blood decals
├── sim/        headless simulation (shares the live systems)
├── ui/         DOM overlay (title, HUD, level-up, shop, results)
└── game.ts     state machine, system pipeline, world rendering
```

## License

[MIT](LICENSE). Art and audio under `public/assets/` follow the notes in [`public/assets/ASSETS.md`](public/assets/ASSETS.md).
