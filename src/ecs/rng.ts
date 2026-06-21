/**
 * Deterministic mulberry32 PRNG.
 * Returns a function producing numbers in [0, 1). Same seed ⇒ identical sequence,
 * which is what lets the headless balance sim (and tests) be reproducible.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
