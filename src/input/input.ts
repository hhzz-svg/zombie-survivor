/**
 * Keyboard + mouse capture for the browser. Exposes a normalized movement axis and the
 * raw mouse position (used to derive aim). Wrapped behind InputProvider so gameplay code
 * never talks to the DOM directly and the headless sim can substitute an AI controller.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True only on the first frame a key transitions from up → down. */
  justPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Called once per frame after all justPressed checks have been made. */
  flush(): void {
    this.pressed.clear();
  }

  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y -= 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}
