// Light-background flood-fill for the new player sprite (white bg → transparent).
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../public/assets/', import.meta.url));
const isBg = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) <= 24 && Math.max(r, g, b) >= 75;

const name = 'player';
const main = path.join(base, `${name}.png`);
const png = PNG.sync.read(fs.readFileSync(main));
const d = png.data;
const w = png.width;
const h = png.height;
const visited = new Uint8Array(w * h);
const stack = [];

const seed = (x, y) => {
  const p = y * w + x;
  if (visited[p]) return;
  const i = p * 4;
  if (isBg(d[i], d[i + 1], d[i + 2])) { visited[p] = 1; stack.push(p); }
};
for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

let filled = 0;
while (stack.length) {
  const p = stack.pop();
  d[p * 4 + 3] = 0;
  filled++;
  const x = p % w;
  const y = (p / w) | 0;
  if (x > 0) seed(x - 1, y);
  if (x < w - 1) seed(x + 1, y);
  if (y > 0) seed(x, y - 1);
  if (y < h - 1) seed(x, y + 1);
}

for (let pass = 0; pass < 2; pass++) {
  const a2 = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let m = d[p * 4 + 3];
      if (x > 0) m = Math.min(m, d[(p - 1) * 4 + 3]);
      if (x < w - 1) m = Math.min(m, d[(p + 1) * 4 + 3]);
      if (y > 0) m = Math.min(m, d[(p - w) * 4 + 3]);
      if (y < h - 1) m = Math.min(m, d[(p + w) * 4 + 3]);
      a2[p] = m;
    }
  }
  for (let p = 0; p < w * h; p++) d[p * 4 + 3] = a2[p];
}

for (let p = 0; p < w * h; p++) {
  if (d[p * 4 + 3] === 0) { d[p * 4] = 0; d[p * 4 + 1] = 0; d[p * 4 + 2] = 0; }
}

fs.writeFileSync(main, PNG.sync.write(png));
console.log(`player: bg cut ${filled}px (${((filled/(w*h))*100).toFixed(1)}%) → transparent`);
