## 2026-06-21 - Task: Improve player weapon holding interaction
### What was done
- Changed player weapon visuals from whole-character sprite switching to a stable base player body with an independently drawn held aim weapon.
- Prevented skill weapons such as nova and orbit from replacing the player's held weapon visual.
- Moved aim bullet spawn, muzzle flash, and muzzle sparks from the player center to a forward muzzle point.
- Added regression tests for held-weapon stability, muzzle-origin bullets, and level-up held-weapon selection.
### Testing
- `npm test` passed: 6 test files, 24 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- Browser smoke check passed on `http://127.0.0.1:5173/`; screenshot captured at `output/playwright/held-weapon.png` and cropped check at `output/playwright/held-weapon-crop.png`.
### Notes
- `src/game.ts`: draws the base player sprite plus a rotated held weapon sprite instead of switching whole player sprites by weapon.
- `src/systems/weapons.ts`: keeps held-weapon state out of the firing loop and spawns aim bullets/effects at a muzzle offset.
- `src/progression.ts`: updates the held weapon only when acquiring or evolving an aim weapon.
- `src/components/index.ts`: clarifies that `Loadout.activeWeapon` means the currently held aim weapon.
- `tests/weapons.test.ts`: adds regression coverage for skill weapons, muzzle spawn position, and background fire not stealing the held weapon.
- `tests/progression.test.ts`: covers held-weapon selection when adding aim and skill weapons.
- `docs/weapon-handling.md`: documents the held-weapon rule for future weapon additions.
- Rollback: restore the files listed above to their previous versions, remove `docs/weapon-handling.md`, remove `tests/weapons.test.ts`, and delete this progress entry.

## 2026-06-21 - Task: Fix floating weapon visual
### What was done
- Removed the independently drawn weapon overlay that made guns appear detached from the character.
- Restored player rendering to composed `player_<weapon>` sprites so guns appear in the character's hands.
- Kept the previous held-weapon rule that skill weapons do not replace the main held aim weapon.
### Testing
- `npm test` passed: 7 test files, 26 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- Browser smoke check passed on `http://127.0.0.1:5175/`; screenshot captured at `output/playwright/held-weapon-composed.png` and cropped check at `output/playwright/held-weapon-composed-crop.png`.
### Notes
- `src/game.ts`: now selects a composed held-weapon player sprite instead of drawing a separate rotated gun sprite.
- `src/render/playerWeaponSprite.ts`: centralizes the mapping from held weapon id to composed player sprite key.
- `tests/playerWeaponSprite.test.ts`: covers composed sprite selection for base and evolved weapons.
- `docs/weapon-handling.md`: updated the weapon visual rule to require composed player sprites for aim weapons.
- `progress.md`: appended this correction record without rewriting previous history.
- Rollback: restore the files listed above to their previous versions and remove this progress entry.

## 2026-06-21 - Task: Unify player character art
### What was done
- Kept only the original `player.png` character art for player rendering.
- Removed inconsistent `player_*` character variant assets.
- Cleaned the asset manifest so it no longer references deleted player variants.
- Updated the player sprite selection rule to always use the single base character.
### Testing
- `npm test` passed: 7 test files, 26 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- Residual reference check passed: no `player_shotgun`, `player_smg`, `player_magnum`, `player_shockwave`, or `player_orbit` references remain.
### Notes
- `public/assets/player_magnum.png`: removed inconsistent player variant.
- `public/assets/player_orbit.png`: removed inconsistent player variant.
- `public/assets/player_shockwave.png`: removed inconsistent player variant.
- `public/assets/player_shotgun.png`: removed inconsistent player variant.
- `public/assets/player_smg.png`: removed inconsistent player variant.
- `public/assets/manifest.json`: removed player variant keys and kept only `player`.
- `src/render/playerWeaponSprite.ts`: now always resolves player rendering to `player`.
- `tests/playerWeaponSprite.test.ts`: now verifies all weapons keep the same player sprite.
- `docs/weapon-handling.md`: documents the single-character rule.
- `progress.md`: appended this task record.
- Rollback: restore the five removed `public/assets/player_*.png` files, restore their manifest keys, restore `src/render/playerWeaponSprite.ts` and `tests/playerWeaponSprite.test.ts` to the composed-sprite behavior, and remove this progress entry.

## 2026-06-21 - Task: Prepare source repository for GitHub upload
### What was done
- Initialized the project as a git repository for source upload.
- Cleaned local browser-test artifacts from the working tree and ignored generated/local-only directories.
- Rewrote the README with clear setup, gameplay, verification, and art-direction notes.
- Confirmed the repository keeps one consistent player character and no longer references deleted player variants.
### Testing
- `npm test` passed: 7 test files, 26 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- Browser smoke check passed on `http://127.0.0.1:5177/`; the only console errors were favicon 404s.
- Git upload-scope check passed: `git status --short` does not list `node_modules`, `dist`, `.playwright-cli`, `output`, or `.claude`.
### Notes
- `.gitignore`: added generated, local, log, browser-test, and agent-local directories to the ignore list.
- `README.md`: replaced corrupted text with a clean source-repository README.
- `.git/`: created by `git init`; no commit or remote was created.
- `progress.md`: appended this upload-preparation record.
- Rollback: remove `.git/` if git initialization is not wanted, restore the previous `.gitignore` and `README.md`, and remove this progress entry.

## 2026-06-21 - Task: Add GitHub README screenshot and prepare push
### What was done
- Processed the provided gameplay screenshot into a 16:9 README hero image.
- Added the screenshot to the README.
- Prepared the repository for pushing to `hhzz-svg/zombie-survivor`.
### Testing
- `npm test` passed: 7 test files, 26 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
### Notes
- `docs/screenshots/gameplay-hero.png`: added processed gameplay screenshot for the README.
- `README.md`: added the gameplay screenshot near the top.
- `progress.md`: appended this upload record.
- Rollback: remove `docs/screenshots/gameplay-hero.png`, remove the README image line, and remove this progress entry.
