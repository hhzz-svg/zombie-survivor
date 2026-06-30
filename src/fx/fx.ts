import type { Renderer } from '../render/renderer';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; color: string; size: number; active: boolean;
}
interface FloatText {
  x: number; y: number; vy: number; text: string; color: string;
  life: number; max: number; active: boolean;
}
interface Flash {
  x: number; y: number; r: number; core: string; glow: string;
  life: number; max: number; active: boolean;
}
interface Shockwave {
  x: number; y: number; r: number; color: string;
  life: number; max: number; active: boolean;
}
interface Streak {
  x1: number; y1: number; x2: number; y2: number; color: string;
  life: number; max: number; active: boolean;
}

/**
 * Pooled particles + floating combat text + impact flashes. Kept as plain arrays (not ECS
 * entities) because there can be thousands of them and they need no querying — just integrate
 * & draw. Mirrors the particle approach from the existing Mario clone, generalized & pooled.
 */
export class FX {
  private parts: Particle[] = [];
  private texts: FloatText[] = [];
  private flashes: Flash[] = [];
  private waves: Shockwave[] = [];
  private streaks: Streak[] = [];

  burst(x: number, y: number, count: number, color: string, speed = 120, rng: () => number = Math.random): void {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const s = speed * (0.4 + rng() * 0.6);
      this.spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s, color, 0.35 + rng() * 0.3, 2 + rng() * 2);
    }
  }

  /** Directional spark cone — for bullet impacts (sprays opposite the travel direction). */
  spark(
    x: number, y: number, dx: number, dy: number, count: number,
    color: string, speed = 200, rng: () => number = Math.random,
  ): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const a = base + (rng() - 0.5) * 1.1;
      const s = speed * (0.4 + rng() * 0.8);
      this.spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s, color, 0.18 + rng() * 0.18, 1.5 + rng() * 2);
    }
  }

  /** Short-lived expanding glow — muzzle flashes, impact pops. */
  flash(x: number, y: number, r: number, core: string, glow: string, life = 0.09): void {
    let f = this.flashes.find((q) => !q.active);
    if (!f) {
      f = { x: 0, y: 0, r: 0, core: '', glow: '', life: 0, max: 0, active: false };
      this.flashes.push(f);
    }
    f.x = x; f.y = y; f.r = r; f.core = core; f.glow = glow; f.life = life; f.max = life; f.active = true;
  }

  shockwave(x: number, y: number, r: number, color = '#e36aa0', life = 0.35): void {
    let w = this.waves.find((q) => !q.active);
    if (!w) {
      w = { x: 0, y: 0, r: 0, color: '', life: 0, max: 0, active: false };
      this.waves.push(w);
    }
    w.x = x; w.y = y; w.r = r; w.color = color; w.life = life; w.max = life; w.active = true;
  }

  streak(x1: number, y1: number, x2: number, y2: number, color: string): void {
    let s = this.streaks.find((q) => !q.active);
    if (!s) {
      s = { x1: 0, y1: 0, x2: 0, y2: 0, color: '', life: 0, max: 0, active: false };
      this.streaks.push(s);
    }
    s.x1 = x1; s.y1 = y1; s.x2 = x2; s.y2 = y2; s.color = color; s.life = 0.18; s.max = 0.18; s.active = true;
  }

  private spawnPart(x: number, y: number, vx: number, vy: number, color: string, life: number, size: number): void {
    let p = this.parts.find((q) => !q.active);
    if (!p) {
      p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: '', size: 0, active: false };
      this.parts.push(p);
    }
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.color = color; p.size = size; p.active = true;
  }

  text(x: number, y: number, str: string, color = '#fff'): void {
    let t = this.texts.find((q) => !q.active);
    if (!t) {
      t = { x: 0, y: 0, vy: 0, text: '', color: '', life: 0, max: 0, active: false };
      this.texts.push(t);
    }
    t.x = x; t.y = y; t.vy = -42; t.text = str; t.color = color; t.life = 0.7; t.max = 0.7; t.active = true;
  }

  update(dt: number): void {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
    for (const t of this.texts) {
      if (!t.active) continue;
      t.y += t.vy * dt; t.vy *= 0.92; t.life -= dt;
      if (t.life <= 0) t.active = false;
    }
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) f.active = false;
    }
    for (const w of this.waves) {
      if (!w.active) continue;
      w.life -= dt;
      if (w.life <= 0) w.active = false;
    }
    for (const s of this.streaks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) s.active = false;
    }
  }

  draw(r: Renderer): void {
    for (const s of this.streaks) {
      if (!s.active) continue;
      const k = Math.max(0, s.life / s.max);
      r.drawLine(s.x1, s.y1, s.x2, s.y2, s.color, 3, 0.72 * k);
      r.drawLine(s.x1, s.y1, s.x2, s.y2, '#ffffff', 1, 0.42 * k);
    }
    for (const w of this.waves) {
      if (!w.active) continue;
      const k = 1 - w.life / w.max;
      r.drawRing(w.x, w.y, w.r * (0.25 + k * 0.75), w.color, 5 * (1 - k) + 1, 0.8 * (1 - k));
      r.drawRing(w.x, w.y, w.r * (0.15 + k * 0.65), '#ffffff', 2, 0.45 * (1 - k));
    }
    for (const f of this.flashes) {
      if (!f.active) continue;
      const k = f.life / f.max; // 1 → 0
      r.drawGlowCircle(f.x, f.y, f.r * (0.6 + 0.4 * k), f.core, f.glow);
    }
    for (const p of this.parts) {
      if (!p.active) continue;
      r.drawCircle(p.x, p.y, p.size, p.color, Math.max(0, p.life / p.max));
    }
    for (const t of this.texts) {
      if (!t.active) continue;
      r.drawText(t.x, t.y, t.text, t.color, 13, 'center', Math.max(0, t.life / t.max));
    }
  }

  clear(): void {
    for (const p of this.parts) p.active = false;
    for (const t of this.texts) t.active = false;
    for (const f of this.flashes) f.active = false;
    for (const w of this.waves) w.active = false;
    for (const s of this.streaks) s.active = false;
  }
}
