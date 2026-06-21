import { Canvas2DRenderer } from './render/canvas2d';
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Canvas2DRenderer(canvas);
const game = new Game(renderer);

// Fixed-timestep loop with a spiral-of-death guard (same accumulator pattern as the Mario clone).
const STEP = 1 / 60;
let last = 0;
let acc = 0;
function frame(ts: number): void {
  if (!last) last = ts;
  let dt = (ts - last) / 1000;
  last = ts;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    game.update(STEP);
    acc -= STEP;
    steps++;
  }
  if (acc > STEP) acc = STEP;
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
