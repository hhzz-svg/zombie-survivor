import { z } from 'zod';
import { DEFAULT_SETTINGS, SettingsSchema } from './settings';

/**
 * Every byte this game persists, in one place, behind one version number.
 *
 * It used to be nine loose localStorage keys written from wherever happened to need them, with
 * no version field anywhere. That is fine right up until the first time a shape changes — at
 * which point old saves either crash the reader or get silently dropped, and a player who has
 * been grinding veterancy for a week loses it without ever being told.
 *
 * The rules here:
 *  - One key, one version, one validation pass. Migrations run in order and are pure functions.
 *  - Nothing in this file may throw. A corrupt, truncated or hand-edited save degrades field by
 *    field to defaults rather than taking the whole profile — losing a best time is recoverable,
 *    losing everything is not.
 *  - Writes keep the previous good value in a backup key, and the reader falls back to it. A
 *    write interrupted mid-quota should never be able to destroy a profile.
 */

const KEY = 'zs-save';
const BACKUP_KEY = 'zs-save.bak';

/** Bump when a migration is added below. */
export const SAVE_VERSION = 1;

const LifetimeSchema = z.object({
  kills: z.number().int().nonnegative().catch(0),
  runs: z.number().int().nonnegative().catch(0),
  wins: z.number().int().nonnegative().catch(0),
}).catch({ kills: 0, runs: 0, wins: 0 });

const DailyRecordSchema = z.object({
  time: z.number().nonnegative().catch(0),
  kills: z.number().int().nonnegative().catch(0),
});

/**
 * `.catch()` on every field is the whole point: one bad value must not invalidate the object
 * around it. Zod would otherwise reject the entire save over a single NaN.
 */
export const SaveSchema = z.object({
  version: z.number().int().positive().catch(SAVE_VERSION),
  best: z.number().nonnegative().catch(0),
  operative: z.string().catch(''),
  achievements: z.array(z.string()).catch([]),
  lifetime: LifetimeSchema,
  operativeXp: z.record(z.string(), z.number().nonnegative().catch(0)).catch({}),
  daily: z.record(z.string(), DailyRecordSchema).catch({}),
  salvage: z.number().nonnegative().catch(0),
  talents: z.record(z.string(), z.number().int().nonnegative().catch(0)).catch({}),
  settings: SettingsSchema,
});

export type SaveData = z.infer<typeof SaveSchema>;

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    best: 0,
    operative: '',
    achievements: [],
    lifetime: { kills: 0, runs: 0, wins: 0 },
    operativeXp: {},
    daily: {},
    salvage: 0,
    talents: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ---------------------------------------------------------------------------
// Storage access. Every call is wrapped: private windows, disabled storage and
// exceeded quotas are normal conditions, not errors worth crashing a game over.

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Migrations. Each one takes the previous shape and returns the next; they run
// in order from whatever version was stored. Keep them pure and total.

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Index `n` migrates a version-`n` save to version `n+1`. */
const MIGRATIONS: readonly Migration[] = [
  // 0 → 1: there was no consolidated save at all, only loose keys. `legacySave()` reads them,
  // so anything arriving here as version 0 is already in the v1 shape.
  (raw) => raw,
];

/** The nine keys the game used before this module existed. */
const LEGACY_KEYS = [
  'zs-best', 'zs-operative', 'zs-ach', 'zs-life', 'zs-ops',
  'zs-daily', 'zs-salvage', 'zs-talents', 'zs-settings',
] as const;

function parseJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Rebuild a save from the pre-versioning keys. Returns undefined when there is nothing to
 * migrate, so a brand-new player is not confused with a player whose save failed to read.
 */
function legacySave(): Record<string, unknown> | undefined {
  const present = LEGACY_KEYS.some((k) => readRaw(k) !== null);
  if (!present) return undefined;
  return {
    version: 0,
    best: Number(readRaw('zs-best') ?? 0),
    operative: readRaw('zs-operative') ?? '',
    achievements: parseJson('zs-ach'),
    lifetime: parseJson('zs-life'),
    operativeXp: parseJson('zs-ops'),
    daily: parseJson('zs-daily'),
    salvage: Number(readRaw('zs-salvage') ?? 0),
    talents: parseJson('zs-talents'),
    settings: parseJson('zs-settings'),
  };
}

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let current = raw;
  let version = typeof raw.version === 'number' ? raw.version : 0;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break; // a save from the future: leave it be and let the schema clamp it
    current = step(current);
    version++;
  }
  return { ...current, version: SAVE_VERSION };
}

/**
 * Load the profile. Tries the live key, then the backup, then the legacy keys, and finally
 * falls back to an empty profile — in every case returning something usable.
 *
 * Migrating writes back immediately, which is why this reader has a side effect. Without it
 * the old keys stay the source of truth indefinitely: the consolidated save would only appear
 * the first time something happened to trigger a write, and until then a damaged `zs-save`
 * would silently fall through to stale legacy data instead of the backup — rolling a player
 * back rather than recovering them. The legacy keys are deliberately left in place as a
 * downgrade path; once `zs-save` exists it always wins.
 */
export function loadSave(): SaveData {
  for (const key of [KEY, BACKUP_KEY]) {
    const parsed = parseJson(key);
    if (!parsed || typeof parsed !== 'object') continue;
    const stored = parsed as Record<string, unknown>;
    const data = SaveSchema.parse(migrate(stored));
    // A save written by an older build is upgraded on disk here, not just in memory.
    if (stored.version !== SAVE_VERSION && typeof stored.version === 'number'
      && stored.version < SAVE_VERSION) {
      writeSave(data);
    }
    return data;
  }
  const legacy = legacySave();
  if (legacy) {
    const data = SaveSchema.parse(migrate(legacy));
    writeSave(data);
    return data;
  }
  return emptySave();
}

/**
 * Persist the profile, keeping the last good copy in a backup key first. Returns false when
 * storage refused the write so callers can tell the difference between "saved" and "pretended".
 */
export function writeSave(data: SaveData): boolean {
  const serialized = JSON.stringify({ ...data, version: SAVE_VERSION });
  const previous = readRaw(KEY);
  if (previous !== null && previous !== serialized) writeRaw(BACKUP_KEY, previous);
  return writeRaw(KEY, serialized);
}

/** Remove everything this game stores, legacy keys included. For a "reset progress" action. */
export function clearSave(): void {
  for (const key of [KEY, BACKUP_KEY, ...LEGACY_KEYS]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage disabled — nothing to clear
    }
  }
}
