// Ground-truth pixel check for the processed sprites.
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../public/assets/', import.meta.url));

for (const name of ['player', 'walker', 'runner', 'spitter', 'exploder', 'brute', 'boss']) {
  const png = PNG.sync.read(fs.readFileSync(path.join(base, `${name}.png`)));
  const d = png.data;
  const w = png.width;
  const h = png.height;
  let a0 = 0;
  let a255 = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) a0++;
    else if (d[i + 3] === 255) a255++;
  }
  const px = (x, y) => {
    const i = (y * w + x) * 4;
    return `[${d[i]},${d[i + 1]},${d[i + 2]},a=${d[i + 3]}]`;
  };
  console.log(
    `${name}: ${w}x${h} transparent=${a0} opaque=${a255} | corner${px(0, 0)} midLeft${px(4, h >> 1)}`,
  );
}
