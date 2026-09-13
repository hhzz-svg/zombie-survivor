/**
 * The obstacle field: a deterministic, procedurally generated layer of static cover.
 *
 * The arena is unbounded (the camera follows the player forever), so cover cannot be hand-placed.
 * Instead every OBSTACLE_CELL-sized cell of the world hashes to at most one axis-aligned block —
 * a pure function of (seed, cellX, cellY). That buys three things at once: infinite terrain, zero
 * memory, and full determinism, so the headless sim replays a run exactly as the browser played it.
 *
 * Every obstacle fits entirely inside its own cell, which is what lets a lookup scan only the
 * cells a query rectangle touches and still be exact.
 */

export type ObstacleKind = 'car' | 'container' | 'wall-h' | 'wall-v' | 'rock';

export interface Obstacle {
  x: number;
  y: number;
  hw: number; // half width
  hh: number; // half height
  kind: ObstacleKind;
}

export const OBSTACLE_CELL = 260;

/** Share of cells carrying cover. Sparse on purpose: cover should read as landmarks, not a maze. */
const DENSITY = 0.35;

/** Cells this close to the origin stay clear so the opening seconds are never a wall sandwich. */
const SAFE_CELLS = 2;

const SHAPES: ReadonlyArray<{ kind: ObstacleKind; hw: number; hh: number; weight: number }> = [
  { kind: 'car', hw: 23, hh: 11, weight: 30 },
  { kind: 'container', hw: 30, hh: 17, weight: 24 },
  { kind: 'wall-h', hw: 48, hh: 8, weight: 18 },
  { kind: 'wall-v', hw: 8, hh: 48, weight: 18 },
  { kind: 'rock', hw: 13, hh: 13, weight: 10 },
];
const SHAPE_TOTAL = SHAPES.reduce((a, s) => a + s.weight, 0);

/** Stateless integer hash (mulberry32's mixing step) — same inputs, same output, forever. */
function cellHash(seed: number, cx: number, cy: number, salt: number): number {
  let h = (seed ^ Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cy | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  return (h ^ (h >>> 14)) >>> 0;
}

/** Hash → [0,1). */
function unit(seed: number, cx: number, cy: number, salt: number): number {
  return cellHash(seed, cx, cy, salt) / 4294967296;
}

/**
 * Per-seed memo. The field is a pure function of (seed, cell), so a cell's answer is valid for
 * the whole run — and with a few hundred enemies each probing 9 cells a frame, recomputing the
 * hashes every time is the one place this layer could actually cost something.
 */
let cacheSeed = Number.NaN;
const cache = new Map<number, Obstacle | null>();
const CACHE_LIMIT = 40000;

/** The single obstacle occupying this cell, or null. Pure: safe to call every frame. */
export function cellObstacle(seed: number, cx: number, cy: number): Obstacle | null {
  if (seed !== cacheSeed) {
    cacheSeed = seed;
    cache.clear();
  }
  const key = ((cx & 0xffff) << 16) | (cy & 0xffff);
  const memo = cache.get(key);
  if (memo !== undefined) return memo;
  const built = buildCellObstacle(seed, cx, cy);
  if (cache.size >= CACHE_LIMIT) cache.clear(); // a run never walks far enough to hit this
  cache.set(key, built);
  return built;
}

function buildCellObstacle(seed: number, cx: number, cy: number): Obstacle | null {
  if (Math.abs(cx) <= SAFE_CELLS && Math.abs(cy) <= SAFE_CELLS) return null;
  if (unit(seed, cx, cy, 1) >= DENSITY) return null;

  let roll = unit(seed, cx, cy, 2) * SHAPE_TOTAL;
  let shape = SHAPES[SHAPES.length - 1]!;
  for (const s of SHAPES) {
    roll -= s.weight;
    if (roll <= 0) {
      shape = s;
      break;
    }
  }

  // Jitter inside the cell, always leaving a margin so neighbouring cells can never overlap.
  const padX = OBSTACLE_CELL / 2 - shape.hw - 10;
  const padY = OBSTACLE_CELL / 2 - shape.hh - 10;
  return {
    x: (cx + 0.5) * OBSTACLE_CELL + (unit(seed, cx, cy, 3) * 2 - 1) * padX,
    y: (cy + 0.5) * OBSTACLE_CELL + (unit(seed, cx, cy, 4) * 2 - 1) * padY,
    hw: shape.hw,
    hh: shape.hh,
    kind: shape.kind,
  };
}

/**
 * Collect every obstacle whose cell overlaps the (x±rx, y±ry) rectangle into `out`.
 * `out` is reused by callers so the hot path allocates nothing.
 */
export function obstaclesInRect(seed: number, x: number, y: number, rx: number, ry: number, out: Obstacle[]): Obstacle[] {
  out.length = 0;
  const cx0 = Math.floor((x - rx) / OBSTACLE_CELL);
  const cx1 = Math.floor((x + rx) / OBSTACLE_CELL);
  const cy0 = Math.floor((y - ry) / OBSTACLE_CELL);
  const cy1 = Math.floor((y + ry) / OBSTACLE_CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const o = cellObstacle(seed, cx, cy);
      if (o) out.push(o);
    }
  }
  return out;
}

/** Obstacles within `r` of a point (cell-granular, so a superset — callers do the precise test). */
export function obstaclesNear(seed: number, x: number, y: number, r: number, out: Obstacle[]): Obstacle[] {
  return obstaclesInRect(seed, x, y, r, r, out);
}

/** Penetration depth of a circle into one box, or 0 when they do not overlap. */
export function circleHitsBox(x: number, y: number, r: number, o: Obstacle): boolean {
  const dx = Math.abs(x - o.x) - o.hw;
  const dy = Math.abs(y - o.y) - o.hh;
  if (dx > r || dy > r) return false;
  if (dx <= 0 || dy <= 0) return true;
  return dx * dx + dy * dy <= r * r;
}

const scratch: Obstacle[] = [];

/** True when a circle of radius `r` at (x, y) overlaps any cover. Used for spawn placement. */
export function blockedAt(seed: number, x: number, y: number, r: number): boolean {
  obstaclesNear(seed, x, y, r + 1, scratch);
  for (const o of scratch) {
    if (circleHitsBox(x, y, r, o)) return true;
  }
  return false;
}

/**
 * Push a circle out of any cover it overlaps, along the shallowest axis, and report the
 * surface normal so the caller can slide velocity along the wall instead of sticking to it.
 */
export function resolveCircle(
  seed: number,
  x: number,
  y: number,
  r: number,
): { x: number; y: number; nx: number; ny: number; hit: boolean } {
  obstaclesNear(seed, x, y, r + 1, scratch);
  let nx = 0;
  let ny = 0;
  let hit = false;
  for (const o of scratch) {
    if (!circleHitsBox(x, y, r, o)) continue;
    // Nearest point on the box to the circle centre.
    const px = Math.max(o.x - o.hw, Math.min(x, o.x + o.hw));
    const py = Math.max(o.y - o.hh, Math.min(y, o.y + o.hh));
    let ox = x - px;
    let oy = y - py;
    let d = Math.hypot(ox, oy);
    if (d === 0) {
      // Centre is inside the box — eject along the shallowest face.
      const left = x - (o.x - o.hw);
      const right = o.x + o.hw - x;
      const up = y - (o.y - o.hh);
      const down = o.y + o.hh - y;
      const m = Math.min(left, right, up, down);
      ox = m === left ? -1 : m === right ? 1 : 0;
      oy = m === up ? -1 : m === down ? 1 : 0;
      if (ox === 0 && oy === 0) oy = 1;
      d = 1;
      x += ox * (m + r);
      y += oy * (m + r);
    } else {
      const push = r - d;
      x += (ox / d) * push;
      y += (oy / d) * push;
    }
    nx += ox / d;
    ny += oy / d;
    hit = true;
  }
  const nl = Math.hypot(nx, ny);
  return { x, y, nx: nl > 0 ? nx / nl : 0, ny: nl > 0 ? ny / nl : 0, hit };
}

// ---------------------------------------------------------------------------
// Explosive barrels: the player's offensive use of the terrain. Same cell grid,
// different salt, and only in cells that carry no static cover.

export const BARREL_HP = 30;
/**
 * Long enough to actually clear the blast. At 0.35s the player could cover 60px before it
 * went off while the blast reached 120px — escaping a barrel you lit at point-blank range
 * needed 343 px/s against a base move speed of 172, i.e. it was impossible, and the balance
 * report duly showed barrels causing 71% of all deaths.
 */
export const BARREL_FUSE = 0.8;
export const BARREL_RADIUS = 120;
export const BARREL_DAMAGE = 90;
const BARREL_CHANCE = 0.16;

/** Where a barrel stands in this cell, or null. */
export function cellBarrel(seed: number, cx: number, cy: number): { x: number; y: number } | null {
  if (Math.abs(cx) <= SAFE_CELLS && Math.abs(cy) <= SAFE_CELLS) return null;
  if (cellObstacle(seed, cx, cy)) return null;
  if (unit(seed, cx, cy, 11) >= BARREL_CHANCE) return null;
  const pad = OBSTACLE_CELL / 2 - 40;
  return {
    x: (cx + 0.5) * OBSTACLE_CELL + (unit(seed, cx, cy, 12) * 2 - 1) * pad,
    y: (cy + 0.5) * OBSTACLE_CELL + (unit(seed, cx, cy, 13) * 2 - 1) * pad,
  };
}
