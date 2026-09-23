import type { Renderer } from './renderer';
import type { EliteBadge } from '../data/elites';

/**
 * Draw an elite's affix badge above its head.
 *
 * Every badge is stroked twice: once wide in near-black, then again in the affix colour.
 * The dark pass is what makes it survive a bright sprite, a blood decal or a wall of
 * bodies behind it — without it a thin coloured glyph disappears into the ground texture.
 *
 * The three silhouettes are deliberately different in *kind*, not just in outline, so they
 * stay apart when the colour is gone and the shape is only ~14px tall:
 *   chevron — two stacked arrowheads (fast)
 *   wedge   — one solid-looking triangle (heavy)
 *   dots    — three separate blobs (toxic)
 */
export function drawEliteBadge(
  r: Renderer,
  badge: EliteBadge,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const s = Math.max(9, size); // below ~9px none of the three silhouettes survive
  const stroke = (x1: number, y1: number, x2: number, y2: number) => {
    r.drawLine(x1, y1, x2, y2, '#0b1013', Math.max(3, s * 0.42), 0.85);
    r.drawLine(x1, y1, x2, y2, color, Math.max(1.6, s * 0.22), 1);
  };

  if (badge === 'chevron') {
    // ^ ^ — two arrowheads stacked, reading as motion
    for (const dy of [-s * 0.34, s * 0.34]) {
      stroke(x - s * 0.5, y + dy + s * 0.26, x, y + dy - s * 0.24);
      stroke(x, y + dy - s * 0.24, x + s * 0.5, y + dy + s * 0.26);
    }
    return;
  }

  if (badge === 'wedge') {
    // a filled triangle: the only badge with a solid interior, so it reads as mass
    const top = y - s * 0.55;
    const bot = y + s * 0.5;
    r.drawLine(x, top, x, bot, '#0b1013', s * 1.15, 0.85); // dark backing slab
    for (let i = 0; i <= 5; i++) {
      const k = i / 5;
      const half = s * 0.58 * k;
      const yy = top + (bot - top) * k;
      r.drawLine(x - half, yy, x + half, yy, color, s * 0.26, 1);
    }
    return;
  }

  // dots — three separate blobs in a triangle, the only badge made of disconnected parts
  const pts: Array<[number, number]> = [
    [x, y - s * 0.48],
    [x - s * 0.46, y + s * 0.34],
    [x + s * 0.46, y + s * 0.34],
  ];
  for (const [px, py] of pts) {
    r.drawCircle(px, py, s * 0.42, '#0b1013', 0.85);
    r.drawCircle(px, py, s * 0.29, color, 1);
  }
}
