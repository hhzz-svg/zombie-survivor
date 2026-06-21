# Zombie Survivor

2D top-down zombie survivor roguelite built with TypeScript, Vite, Canvas 2D, and a small custom ECS.

![Zombie Survivor gameplay screenshot](docs/screenshots/gameplay-hero.png)

The current art direction keeps one consistent player character (`public/assets/player.png`). Weapons are represented through loadout names, upgrade choices, projectiles, muzzle effects, and skill effects rather than swapping to inconsistent character sprites.

## Gameplay

- Move with `WASD` or arrow keys.
- Aim with the mouse.
- Weapons fire automatically toward the aim direction.
- Collect XP gems to level up and choose upgrades.
- Press `B` during a run to open the shop.
- Use item hotkeys shown in the shop/HUD when consumables are available.

## Development

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

## Project Structure

- `src/ecs/`: minimal entity-component storage and deterministic RNG.
- `src/systems/`: gameplay systems for movement, spawning, combat, weapons, pickups, and equipment.
- `src/render/`: Canvas renderer, asset loading, sprite sizing, and player sprite selection.
- `src/data/`: balance, enemies, weapons, passives, and equipment definitions.
- `public/assets/`: runtime sprites and audio loaded by the browser.
- `tests/`: Vitest coverage for core systems, progression, equipment, weapons, and headless simulation.
- `docs/`: project notes for future development.

## Verification

Before publishing or changing gameplay, run:

```bash
npm test
npm run typecheck
npm run build
```

## GitHub Pages

This repository is ready as a source repository. A GitHub Pages deployment can be added later by publishing the Vite `dist/` output, but deployment configuration is intentionally not included yet.

## Art Notes

Do not mix `player_<weapon>` character variants unless the full player set is redrawn consistently. For real held-weapon interaction later, prefer a unified 2D character with hand anchors or layered sprites instead of switching between unrelated character images.
