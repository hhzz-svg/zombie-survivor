// De-fringe AI "transparent" PNGs: kill the white halo left by white-matte alpha cutouts.
// Re-runnable: originals are backed up to public/assets/_raw and always processed from there.
//   node tools/defringe.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../public/assets/', import.meta.url));
const rawDir = path.join(base, '_raw');
fs.mkdirSync(rawDir, { recursive: true });

const files = ['player', 'walker', 'runner', 'spitter', 'exploder', 'brute', 'boss'];

for (const name of files) {
  const main = path.join(base, `${name}.png`);
  const backup = path.join(rawDir, `${name}.png`);
  if (!fs.existsSync(main)) {
    console.log('skip (missing):', name);
    continue;
  }
  if (!fs.existsSync(backup)) fs.copyFileSync(main, backup);

  const png = PNG.sync.read(fs.readFileSync(backup));
  const d = png.data;
  const w = png.width;
  const h = png.height;

  // 1) Cut near-white semi-transparent edge pixels (the halo) + faint dust.
  let cut = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0 || a === 255) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if ((mn > 195 && mx - mn < 45) || a < 10) {
      d[i + 3] = 0; // white-ish fringe or faint dust → fully transparent
      cut++;
    }
  }

  // 2) 1px alpha erosion (4-neighbour min) to clean any residual soft edge.
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

  fs.writeFileSync(main, PNG.sync.write(png));
  console.log(`${name}: ${w}x${h}  fringe cut=${cut}`);
}
console.log('done');
