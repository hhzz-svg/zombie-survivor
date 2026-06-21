import type { Camera, Renderer } from './renderer';

/** Canvas 2D implementation: DPR-aware, centered camera. Placeholder shapes until sprites land in M5. */
export class Canvas2DRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  begin(cam: Camera): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.translate(Math.round(this.width / 2 - cam.x), Math.round(this.height / 2 - cam.y));
  }

  drawRect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x - w / 2, y - h / 2, w, h);
    this.ctx.globalAlpha = 1;
  }

  drawCircle(x: number, y: number, r: number, color: string, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  drawRing(x: number, y: number, r: number, color: string, lineWidth = 2, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  drawSprite(
    img: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    flipX = false,
    alpha = 1,
  ): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.imageSmoothingEnabled = true;
    if (flipX) {
      this.ctx.save();
      this.ctx.translate(x, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(img, -w / 2, y - h / 2, w, h);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    }
    this.ctx.globalAlpha = 1;
  }

  drawSpriteRot(
    img: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    rot: number,
    flipX = false,
    alpha = 1,
    pivotY = 0,
  ): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.save();
    this.ctx.translate(x, y + pivotY); // rotate about a point near the feet for a believable topple
    this.ctx.rotate(rot);
    this.ctx.scale(flipX ? -1 : 1, 1);
    this.ctx.drawImage(img, -w / 2, -h / 2 - pivotY, w, h);
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  drawEllipse(x: number, y: number, rx: number, ry: number, color: string, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(1, ry / rx);
    this.ctx.beginPath();
    this.ctx.arc(0, 0, rx, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  drawTracer(
    x: number, y: number, vx: number, vy: number,
    len: number, width: number, core: string, glow: string,
  ): void {
    const sp = Math.hypot(vx, vy) || 1;
    const ux = vx / sp;
    const uy = vy / sp;
    const tx = x - ux * len;
    const ty = y - uy * len;
    this.ctx.save();
    this.ctx.lineCap = 'round';
    // soft outer glow
    this.ctx.shadowColor = glow;
    this.ctx.shadowBlur = width * 3.2;
    this.ctx.strokeStyle = glow;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(tx, ty);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    // hot bright core, shorter
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = core;
    this.ctx.lineWidth = Math.max(1, width * 0.42);
    this.ctx.beginPath();
    this.ctx.moveTo(tx + ux * len * 0.35, ty + uy * len * 0.35);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawGlowCircle(x: number, y: number, r: number, core: string, glow: string): void {
    this.ctx.save();
    this.ctx.shadowColor = glow;
    this.ctx.shadowBlur = r * 2.2;
    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = core;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawText(
    x: number,
    y: number,
    text: string,
    color: string,
    size = 14,
    align: CanvasTextAlign = 'left',
    alpha = 1,
  ): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.font = `bold ${size}px system-ui, sans-serif`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, y);
    this.ctx.globalAlpha = 1;
  }

  /** Low-health danger vignette: radial red fade from edges, drawn in screen space. */
  drawVignette(intensity: number): void {
    if (intensity <= 0) return;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to screen coords
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = Math.max(this.width, this.height) * 0.8;
    const grad = this.ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    grad.addColorStop(0, 'rgba(120, 0, 0, 0)');
    grad.addColorStop(0.7, `rgba(180, 20, 20, ${intensity * 0.2})`);
    grad.addColorStop(1, `rgba(80, 0, 0, ${intensity * 0.45})`);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  end(): void {
    this.ctx.restore();
  }
}
