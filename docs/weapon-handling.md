# Weapon Handling

Player visuals use a stable held-weapon rule:

- Player visuals always use the single base `player` sprite to keep the character identity consistent.
- The currently held weapon is the latest acquired or evolved `aim` weapon.
- `nova` and `orbit` weapons are skill effects. They stay in the loadout and can fire, but they do not replace the held weapon visual.
- Aim bullets spawn from a muzzle point in front of the player, so tracers and muzzle flashes appear from the weapon direction instead of the player center.

Do not add `player_<weapon>` character variants unless the full character set is redrawn consistently.
