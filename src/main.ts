import { loadSave } from './save';
import { setLanguage } from './i18n';

/**
 * The language has to be settled before anything else loads: the data tables call `tr()` at
 * module scope, so by the time `./game` is imported the choice must already be final. That
 * is why the rest of the bootstrap sits behind dynamic imports — see i18n.ts.
 *
 * It runs inside an async function rather than at the top level because the build target
 * predates top-level await.
 */
const language = loadSave().settings.language;
setLanguage(language);
// Keep the document in step, so screen readers and the browser's own UI agree with the page.
document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';

async function boot(): Promise<void> {
  const [{ Canvas2DRenderer }, { Game }] = await Promise.all([
    import('./render/canvas2d'),
    import('./game'),
  ]);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Canvas2DRenderer(canvas);
  const game = new Game(renderer);

  // Dev-only QA hook: lets manual tests jump to time-gated events (surges, drops, boss).
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__zs = game;
  }

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
}

void boot();
