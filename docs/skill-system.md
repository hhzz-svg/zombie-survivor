# Active Skills Shop System

## Overview

The shop now sells two categories:
- equipment: consumable charges, buffs, and shields
- skills: run-only active abilities with cooldowns

Skill cards appear after Stage 3. Stage 4+ can show up to two skill cards per shop refresh.

## Skills

- Dash: move 160px in the aim direction and gain brief invulnerability.
- Burst: deal area damage and knockback around the player.
- Barrier: grant temporary shield layers that absorb hits.
- Slow: reduce enemy movement and attack cadence for a short window.

## Assets

Skill icons live in `public/assets/` and are registered in `public/assets/manifest.json`:
- `skill_dash.png`
- `skill_burst.png`
- `skill_barrier.png`
- `skill_slow.png`

## Notes

This system keeps the player visual unchanged. The run communicates upgrades through UI cards, cooldown slots, projectiles, and VFX instead of character re-skins.
