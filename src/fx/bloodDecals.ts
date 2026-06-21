import type { Renderer } from '../render/renderer';

interface Decal {
  x: number; y: number; r: number; rot: number; alpha: number; active: boolean;
}

/**
 * Permanent blood splatters painted on the ground where enemies die. Pooled, never expire
 * (until the run ends), and drawn first so they're under everything. Each splat is a rotated
 * dark ellipse with some randomness so they don't look stamped.
 */
export class BloodDecals {
  private decals: Decal[] = [];
  private readonly maxDecals = 400; // cap so long runs don't explode draw calls

  spawn(x: number, y: number, baseR: number): void {
    let d = this.decals.find((q) => !q.active);
    if (!d) {
      if (this.decals.length >= this.maxDecals) return; // hit cap, skip
      d = { x: 0, y: 0, r: 0, rot: 0, alpha: 0, active: false };
      this.decals.push(d);
    }
    d.x = x + (Math.random() - 0.5) * baseR * 0.6;
    d.y = y + (Math.random() - 0.5) * baseR * 0.6;
    d.r = baseR * (0.7 + Math.random() * 0.5);
    d.rot = Math.random() * Math.PI * 2;
    d.alpha = 0.38 + Math.random() * 0.18;
    d.active = true;
  }

  draw(r: Renderer): void {
    for (const d of this.decals) {
      if (!d.active) continue;
      // irregular splatter — two overlapping ellipses at slightly different angles
      r.drawEllipse(d.x, d.y, d.r, d.r * 0.65, '#1a0a0a', d.alpha);
      r.drawEllipse(d.x + d.r * 0.2, d.y - d.r * 0.15, d.r * 0.8, d.r * 0.5, '#0d0505', d.alpha * 0.7);
    }
  }

  clear(): void {
    for (const d of this.decals) d.active = false;
  }
}
