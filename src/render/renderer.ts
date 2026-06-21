export interface Camera {
  x: number;
  y: number;
}

/**
 * Render backend abstraction. Canvas2D implements it today; a WebGL/Pixi backend can be
 * added once we hit the ~1500-sprite Canvas2D ceiling, without touching game logic.
 * All coordinates are world-space (the camera transform is applied in begin()).
 */
export interface Renderer {
  readonly width: number;
  readonly height: number;
  begin(cam: Camera): void;
  drawRect(x: number, y: number, w: number, h: number, color: string, alpha?: number): void;
  drawCircle(x: number, y: number, r: number, color: string, alpha?: number): void;
  drawRing(x: number, y: number, r: number, color: string, lineWidth?: number, alpha?: number): void;
  /** Draw an image centered at (x, y), optionally mirrored horizontally. */
  drawSprite(
    img: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    flipX?: boolean,
    alpha?: number,
  ): void;
  /** Like drawSprite but rotated by `rot` rad about a pivot `pivotY` below center (feet). */
  drawSpriteRot(
    img: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    rot: number,
    flipX?: boolean,
    alpha?: number,
    pivotY?: number,
  ): void;
  /** Filled ellipse centered at (x, y) — used for soft ground shadows. */
  drawEllipse(x: number, y: number, rx: number, ry: number, color: string, alpha?: number): void;
  /** Velocity-aligned glowing tracer for projectiles (tail behind the head). */
  drawTracer(
    x: number, y: number, vx: number, vy: number,
    len: number, width: number, core: string, glow: string,
  ): void;
  /** Glowing dot with a hot core — for XP gems, orbit blades, energy bits. */
  drawGlowCircle(x: number, y: number, r: number, core: string, glow: string): void;
  drawText(
    x: number,
    y: number,
    text: string,
    color: string,
    size?: number,
    align?: CanvasTextAlign,
    alpha?: number,
  ): void;
  /** Red screen-edge vignette for low health (intensity 0..1). */
  drawVignette(intensity: number): void;
  end(): void;
}
