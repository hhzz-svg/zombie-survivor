import type { Renderer } from '../render/renderer';
import type { AssetStore } from '../render/assets';
import { enemySpriteSize } from '../render/spriteScale';

interface Corpse {
  x: number; y: number; key: string; r: number; isBoss: boolean;
  flipX: boolean; rotTarget: number; rot: number; sink: number;
  life: number; max: number; active: boolean;
}
interface After {
  x: number; y: number; key: string; r: number; isBoss: boolean;
  flipX: boolean; life: number; max: number; active: boolean;
}

/**
 * Visual-only death/knockback flourishes that need the enemy sprite. Kept out of the ECS/sim
 * (the sim never spawns these) and pooled like FX. Toppling corpses fall over about their feet
 * and fade; afterimages are translucent stamps left behind during a hard knockback.
 */
export class CorpseFX {
  private corpses: Corpse[] = [];
  private afters: After[] = [];

  spawnCorpse(x: number, y: number, key: string, r: number, isBoss: boolean, flipX: boolean): void {
    let c = this.corpses.find((q) => !q.active);
    if (!c) {
      c = {
        x: 0, y: 0, key: '', r: 0, isBoss: false, flipX: false,
        rotTarget: 0, rot: 0, sink: 0, life: 0, max: 0, active: false,
      };
      this.corpses.push(c);
    }
    c.x = x; c.y = y; c.key = key; c.r = r; c.isBoss = isBoss; c.flipX = flipX;
    c.rotTarget = (flipX ? -1 : 1) * (1.25 + Math.random() * 0.3);
    c.rot = 0; c.sink = 0;
    c.life = isBoss ? 6 : 2.6; c.max = c.life; c.active = true;
  }

  spawnAfter(x: number, y: number, key: string, r: number, isBoss: boolean, flipX: boolean): void {
    let a = this.afters.find((q) => !q.active);
    if (!a) {
      a = { x: 0, y: 0, key: '', r: 0, isBoss: false, flipX: false, life: 0, max: 0, active: false };
      this.afters.push(a);
    }
    a.x = x; a.y = y; a.key = key; a.r = r; a.isBoss = isBoss; a.flipX = flipX;
    a.life = 0.22; a.max = 0.22; a.active = true;
  }

  update(dt: number): void {
    for (const c of this.corpses) {
      if (!c.active) continue;
      c.rot += (c.rotTarget - c.rot) * Math.min(1, dt * 12); // ease toward the toppled angle
      c.sink += (1 - c.sink) * Math.min(1, dt * 3);
      c.life -= dt;
      if (c.life <= 0) c.active = false;
    }
    for (const a of this.afters) {
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) a.active = false;
    }
  }

  draw(r: Renderer, assets: AssetStore): void {
    // afterimages first (behind live actors), then corpses on the ground
    for (const a of this.afters) {
      if (!a.active) continue;
      const img = assets.get(a.key);
      if (!img) continue;
      const size = enemySpriteSize(a.r, a.isBoss);
      r.drawSprite(img, a.x, a.y + a.r - size / 2, size, size, a.flipX, (a.life / a.max) * 0.35);
    }
    for (const c of this.corpses) {
      if (!c.active) continue;
      const img = assets.get(c.key);
      const k = c.life / c.max;
      const fade = k > 0.32 ? 1 : k / 0.32; // hold, then fade out at the end
      if (img) {
        const size = enemySpriteSize(c.r, c.isBoss);
        r.drawEllipse(c.x, c.y + c.r * 0.75, c.r * (0.9 + c.sink * 0.5), c.r * 0.36, `rgba(0,0,0,${0.32 * fade})`);
        r.drawSpriteRot(img, c.x, c.y + c.sink * c.r * 0.4, size, size, c.rot, c.flipX, fade, size * 0.34);
      }
    }
  }

  clear(): void {
    for (const c of this.corpses) c.active = false;
    for (const a of this.afters) a.active = false;
  }
}
