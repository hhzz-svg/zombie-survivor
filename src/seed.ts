/**
 * Run seeds. The whole simulation is deterministic from one uint32, so a seed is the entire
 * run: same seed, same obstacle field, same spawns, same supply rolls. Displaying it (and
 * letting it be typed back in) turns that property into a feature — shared runs and dailies.
 */

/** uint32 → a short, readable, unambiguous code, e.g. "K3F9Z2". */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');
}

/** Parse a seed code back to a uint32. Accepts the code we print, or a plain number. */
export function parseSeed(text: string): number | null {
  const t = text.trim().toUpperCase();
  if (!t) return null;
  if (!/^[0-9A-Z]{1,7}$/.test(t)) return null;
  const n = parseInt(t, 36);
  return Number.isFinite(n) && n >= 0 ? n >>> 0 : null;
}

/** A fresh random seed for a normal run. */
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/** YYYY-MM-DD in the player's own timezone — the daily rolls over at their local midnight. */
export function dailyKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Everyone playing the same local date gets the same world. */
export function dailySeed(key: string = dailyKey()): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
