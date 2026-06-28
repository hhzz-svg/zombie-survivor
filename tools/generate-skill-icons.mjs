import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';

const W = 96;
const H = 96;

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hex(value) {
  const clean = value.replace('#', '');
  const hasAlpha = clean.length === 8;
  const n = Number.parseInt(clean, 16);
  if (hasAlpha) return [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function mix(a, b, t) {
  return [
    clamp(a[0] + (b[0] - a[0]) * t),
    clamp(a[1] + (b[1] - a[1]) * t),
    clamp(a[2] + (b[2] - a[2]) * t),
    clamp(a[3] + (b[3] - a[3]) * t),
  ];
}

function make() {
  return new PNG({ width: W, height: H });
}

function blend(png, x, y, rgba) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (Math.floor(y) * W + Math.floor(x)) * 4;
  const a = rgba[3] / 255;
  const inv = 1 - a;
  png.data[i] = clamp(rgba[0] * a + png.data[i] * inv);
  png.data[i + 1] = clamp(rgba[1] * a + png.data[i + 1] * inv);
  png.data[i + 2] = clamp(rgba[2] * a + png.data[i + 2] * inv);
  png.data[i + 3] = clamp(255 * (a + (png.data[i + 3] / 255) * inv));
}

function circle(png, cx, cy, r, color) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) blend(png, x, y, color);
    }
  }
}

function ring(png, cx, cy, r, thick, color) {
  for (let y = Math.floor(cy - r - thick); y <= cy + r + thick; y++) {
    for (let x = Math.floor(cx - r - thick); x <= cx + r + thick; x++) {
      if (Math.abs(Math.hypot(x - cx, y - cy) - r) <= thick) blend(png, x, y, color);
    }
  }
}

function poly(png, pts, color) {
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])));
  const maxX = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...pts.map((p) => p[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        const hit = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi);
        if (hit) inside = !inside;
      }
      if (inside) blend(png, x, y, color);
    }
  }
}

function line(png, x0, y0, x1, y1, width, color) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.8);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circle(png, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color);
  }
}

function glowBase(png, c1, c2) {
  const a = hex(c1);
  const b = hex(c2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 48, y - 48) / 54;
      if (d <= 1) {
        const color = mix(a, b, d);
        color[3] = clamp((1 - d) * 110);
        blend(png, x, y, color);
      }
    }
  }
}

function save(name, draw) {
  const png = make();
  draw(png);
  writeFileSync(`public/assets/${name}.png`, PNG.sync.write(png));
}

save('skill_dash', (p) => {
  glowBase(p, '#43f3ff', '#173d66');
  line(p, 16, 63, 48, 38, 8, hex('#163b58cc'));
  line(p, 24, 70, 56, 45, 5, hex('#52ecff99'));
  line(p, 11, 47, 35, 30, 4, hex('#8ff7ff88'));
  poly(p, [[30, 62], [63, 24], [60, 44], [82, 44], [45, 74], [50, 55]], hex('#95fbffff'));
  poly(p, [[30, 62], [63, 24], [60, 44], [82, 44], [45, 74], [50, 55]], hex('#2ab8f0cc'));
  ring(p, 48, 48, 36, 2.2, hex('#9cfaff88'));
});

save('skill_burst', (p) => {
  glowBase(p, '#ffb25c', '#5b1f18');
  ring(p, 48, 48, 32, 5, hex('#ff7c3cff'));
  ring(p, 48, 48, 22, 4, hex('#ffd27aff'));
  circle(p, 48, 48, 11, hex('#fff2b8ee'));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(p, 48 + Math.cos(a) * 18, 48 + Math.sin(a) * 18, 48 + Math.cos(a) * 39, 48 + Math.sin(a) * 39, 4, hex('#ff8b4fcc'));
  }
});

save('skill_barrier', (p) => {
  glowBase(p, '#66c5ff', '#102d62');
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    pts.push([48 + Math.cos(a) * 33, 48 + Math.sin(a) * 33]);
  }
  poly(p, pts, hex('#173f7ecc'));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    line(p, a[0], a[1], b[0], b[1], 5, hex('#9fdcffff'));
  }
  poly(p, [[48, 22], [68, 36], [62, 66], [48, 76], [34, 66], [28, 36]], hex('#5ab8ff77'));
  line(p, 35, 48, 44, 59, 6, hex('#e7f7ffff'));
  line(p, 44, 59, 63, 36, 6, hex('#e7f7ffff'));
});

save('skill_slow', (p) => {
  glowBase(p, '#a88cff', '#16205d');
  ring(p, 48, 48, 31, 4, hex('#bba7ffff'));
  ring(p, 48, 48, 20, 2, hex('#6bd6ff88'));
  line(p, 48, 48, 48, 29, 5, hex('#f0ecffff'));
  line(p, 48, 48, 61, 56, 5, hex('#f0ecffff'));
  circle(p, 48, 48, 5, hex('#f8f3ffff'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circle(p, 48 + Math.cos(a) * 38, 48 + Math.sin(a) * 38, 2.2, hex('#80e6ffaa'));
  }
});
