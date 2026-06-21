/**
 * Uniform-grid spatial hash for neighbour/collision queries over the horde.
 * Chosen over a quadtree because entities are dense and highly dynamic: O(1) insert,
 * no tree rebuild, trivial to reason about. Cell size ≈ largest common entity diameter.
 * Stores only enemy ids (the one set everything else queries against).
 */
export class SpatialHash {
  private readonly cell: number;
  private readonly map = new Map<number, number[]>();

  constructor(cellSize: number) {
    this.cell = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Pack two 16-bit cell coords into one int. Far-apart wrap collisions are irrelevant at our scale.
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    this.map.clear();
  }

  insert(id: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const arr = this.map.get(k);
    if (arr) arr.push(id);
    else this.map.set(k, [id]);
  }

  /** Append ids from all cells overlapping the circle (x,y,r) into `out`. Caller does the precise test. */
  query(x: number, y: number, r: number, out: number[]): number[] {
    out.length = 0;
    const minX = Math.floor((x - r) / this.cell);
    const maxX = Math.floor((x + r) / this.cell);
    const minY = Math.floor((y - r) / this.cell);
    const maxY = Math.floor((y + r) / this.cell);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (arr) for (const id of arr) out.push(id);
      }
    }
    return out;
  }
}
