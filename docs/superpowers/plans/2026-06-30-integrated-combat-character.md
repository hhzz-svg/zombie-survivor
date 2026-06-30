# Integrated Combat Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detached weapon/equipment layers with weapon-specific, full-body combat sprites whose hands, weapon, recoil, shadow, and muzzle feedback read as one pseudo-3D character.

**Architecture:** Add one pure pose-selection module that maps the current firearm and aim input to a combat sprite key, horizontal mirror, bounded body lean, feet-anchored offset, and muzzle point. `Game.drawWorld` consumes that result, while the generated transparent PNGs contain the hands and weapon already composited into the character artwork.

**Tech Stack:** TypeScript, Canvas2D renderer, Vitest, Vite, PNG assets, built-in ImageGen plus local chroma-key removal.

---

### Task 1: Define the integrated combat pose contract

**Files:**
- Create: `tests/combatActor.test.ts`
- Create: `src/render/combatActor.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { combatActorPose } from '../src/render/combatActor';

describe('combatActorPose', () => {
  it('selects a weapon-specific full-character sprite', () => {
    expect(combatActorPose({ weaponSprite: 'shotgun', aimX: 1, aimY: 0, radius: 18, bob: 0, recoil: 0 }).key)
      .toBe('player_shotgun');
  });

  it('mirrors the whole character instead of detaching the weapon', () => {
    const right = combatActorPose({ weaponSprite: 'pistol', aimX: 1, aimY: 0, radius: 18, bob: 0, recoil: 0 });
    const left = combatActorPose({ weaponSprite: 'pistol', aimX: -1, aimY: 0, radius: 18, bob: 0, recoil: 0 });
    expect(right.flipX).toBe(false);
    expect(left.flipX).toBe(true);
    expect(left.muzzleX).toBeCloseTo(-right.muzzleX);
  });

  it('keeps vertical aim lean bounded so the actor never lies sideways', () => {
    const pose = combatActorPose({ weaponSprite: 'smg', aimX: 0.01, aimY: 1, radius: 18, bob: 0, recoil: 0 });
    expect(Math.abs(pose.rotation)).toBeLessThanOrEqual(0.14);
  });

  it('moves the character and muzzle backward together during recoil', () => {
    const idle = combatActorPose({ weaponSprite: 'magnum', aimX: 1, aimY: 0, radius: 18, bob: 0, recoil: 0 });
    const firing = combatActorPose({ weaponSprite: 'magnum', aimX: 1, aimY: 0, radius: 18, bob: 0, recoil: 1 });
    expect(firing.x).toBeLessThan(idle.x);
    expect(firing.muzzleX).toBeLessThan(idle.muzzleX);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run tests/combatActor.test.ts`

Expected: FAIL because `src/render/combatActor.ts` does not exist.

- [ ] **Step 3: Implement the minimal pose function**

```ts
export interface CombatActorInput {
  weaponSprite?: string;
  aimX: number;
  aimY: number;
  radius: number;
  bob: number;
  recoil: number;
}

export interface CombatActorPose {
  key: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  flipX: boolean;
  muzzleX: number;
  muzzleY: number;
}

const FIREARM_KEYS: Record<string, string> = {
  pistol: 'player_pistol',
  shotgun: 'player_shotgun',
  smg: 'player_smg',
  magnum: 'player_magnum',
};

export function combatActorPose(input: CombatActorInput): CombatActorPose {
  const length = Math.hypot(input.aimX, input.aimY) || 1;
  const ax = input.aimX / length;
  const ay = input.aimY / length;
  const flipX = ax < 0;
  const side = flipX ? -1 : 1;
  const pull = input.recoil * input.radius * 0.16;
  return {
    key: FIREARM_KEYS[input.weaponSprite ?? ''] ?? 'player_pistol',
    x: -ax * pull,
    y: -input.bob - ay * pull * 0.25,
    size: input.radius * 4.6,
    rotation: Math.max(-0.14, Math.min(0.14, ay * 0.14)) * side,
    flipX,
    muzzleX: side * input.radius * 1.75 - ax * pull,
    muzzleY: -input.radius * 0.42 + ay * input.radius * 0.65 - input.bob,
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run tests/combatActor.test.ts`

Expected: 4 tests pass.

### Task 2: Create weapon-specific integrated character assets

**Files:**
- Create: `public/assets/player_pistol.png`
- Create: `public/assets/player_shotgun.png`
- Create: `public/assets/player_smg.png`
- Create: `public/assets/player_magnum.png`
- Modify: `public/assets/manifest.json`

- [ ] **Step 1: Generate the four complete character images**

Use the current `public/assets/player.png` as the identity/style reference and `docs/references/target-pseudo3d-combat.png` as the pose/camera reference. Generate one chroma-key source per weapon: full body, three-quarter top-down stance facing right, both hands gripping the named weapon, red scarf and olive jacket preserved, flat `#00ff00` background, no shadow, text, watermark, loose weapon, duplicate limb, or cropped body. Copy the selected built-in outputs to `output/imagegen/player_pistol_chroma.png`, `output/imagegen/player_shotgun_chroma.png`, `output/imagegen/player_smg_chroma.png`, and `output/imagegen/player_magnum_chroma.png` before post-processing.

- [ ] **Step 2: Remove chroma key and normalize the assets**

Run for every generated source:

```powershell
$names = @('pistol', 'shotgun', 'smg', 'magnum')
foreach ($name in $names) {
  python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" `
    --input "output/imagegen/player_${name}_chroma.png" `
    --out "public/assets/player_${name}.png" `
    --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
}
```

Then trim transparent margins and place each subject on a 1024×1024 transparent canvas with aligned feet.

- [ ] **Step 3: Register the assets**

Add these manifest entries:

```json
"player_pistol": "player_pistol.png",
"player_shotgun": "player_shotgun.png",
"player_smg": "player_smg.png",
"player_magnum": "player_magnum.png"
```

- [ ] **Step 4: Validate alpha and dimensions**

Run a Pillow check that asserts every file is RGBA, 1024×1024, has transparent corners, and has non-empty opaque subject coverage.

### Task 3: Replace the detached render path

**Files:**
- Modify: `src/game.ts`
- Delete: `src/render/heldGear.ts`
- Delete: `tests/heldGear.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Draw the full combat character from one sprite**

Import `combatActorPose`, compute the current primary firearm pose, and draw `pose.key` with `drawSpriteRot` around the existing feet pivot. If the integrated image has not loaded, fall back to `player` without drawing any separate gun.

- [ ] **Step 2: Remove detached weapon and equipment drawing**

Remove `heldWeaponPose`, `carriedEquipmentPose`, and `selectedEquipmentIconKeys` imports and all associated draw calls. Delete the now-unused module and tests.

- [ ] **Step 3: Add feet-anchored recoil and muzzle feedback**

When recoil is active, draw a warm glow at `(player + pose.muzzle)` and a short aim-aligned line. Keep the existing bullet/tracer behavior unchanged.

- [ ] **Step 4: Update documentation**

Replace the previous claim about separate held layers with a precise note that firearms are composited into weapon-specific character sprites and animated around a feet anchor.

- [ ] **Step 5: Run engineering verification**

Run:

```powershell
npx vitest run tests/combatActor.test.ts tests/motion.test.ts
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all tests, typecheck, build, and diff checks pass.

### Task 4: Run visual QA against the supplied reference

**Files:**
- Create: `docs/screenshots/integrated-combat-gameplay.png`
- Create: `docs/screenshots/integrated-combat-closeup.png`
- Create: `design-qa.md`
- Modify: `progress.md`

- [ ] **Step 1: Capture the same target state**

Start the game, enter a run at 1280×720, move and fire until the hero is clearly aiming at a nearby enemy, then save a full-frame screenshot and a focused character crop.

- [ ] **Step 2: Compare source and implementation together**

Build a side-by-side comparison image from `docs/references/target-pseudo3d-combat.png` and the implementation screenshot. Check character/weapon cohesion, camera impression, feet anchor, shadow, muzzle feedback, palette, image edge quality, and HUD readability.

- [ ] **Step 3: Fix all P0/P1/P2 visual findings**

Adjust only sprite scale, anchor, bounded lean, shadow, and muzzle feedback. Re-capture and repeat until no actionable P0/P1/P2 issue remains.

- [ ] **Step 4: Record QA and repository progress**

Write `design-qa.md` with source path, implementation path, viewport, state, full/focused comparison evidence, findings, patches, and `final result: passed`. Append the required dated task entry to `progress.md`, listing every changed file and the rollback commit/command.

- [ ] **Step 5: Commit and push**

Commit the completed implementation, push `codex/tactical-pseudo3d-redesign`, and verify the remote branch hash matches local HEAD.
