import { describe, it, expect, beforeEach } from 'vitest';
import { loadSave, writeSave, clearSave, emptySave, SAVE_VERSION } from '../src/save';
import { DEFAULT_SETTINGS } from '../src/settings';

/** In-memory localStorage, plus a switch to make it fail the way a private window does. */
function installStorage(): { store: Map<string, string>; setFailing: (on: boolean) => void } {
  const store = new Map<string, string>();
  let failing = false;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => {
      if (failing) throw new Error('storage disabled');
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (failing) throw new Error('quota exceeded');
      store.set(k, v);
    },
    removeItem: (k: string) => {
      if (failing) throw new Error('storage disabled');
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return { store, setFailing: (on: boolean) => { failing = on; } };
}

let storage: ReturnType<typeof installStorage>;
beforeEach(() => {
  storage = installStorage();
});

describe('a fresh profile', () => {
  it('loads defaults when nothing is stored', () => {
    expect(loadSave()).toEqual(emptySave());
  });

  it('round-trips everything it claims to persist', () => {
    const save = {
      ...emptySave(),
      best: 274,
      operative: 'hunter',
      achievements: ['victory', 'combo-25'],
      lifetime: { kills: 9000, runs: 40, wins: 3 },
      operativeXp: { hunter: 850 },
      daily: { '2026-09-13': { time: 240, kills: 3000 } },
      salvage: 1200,
      talents: { caliber: 3, revive: 1 },
      settings: { ...DEFAULT_SETTINGS, volume: 0.25, shake: 0 },
    };
    expect(writeSave(save)).toBe(true);
    expect(loadSave()).toEqual(save);
  });

  it('stamps the current version on write', () => {
    writeSave({ ...emptySave(), version: 0 });
    expect(loadSave().version).toBe(SAVE_VERSION);
  });
});

describe('damaged saves degrade field by field', () => {
  it('survives outright garbage', () => {
    storage.store.set('zs-save', '{not json at all');
    expect(loadSave()).toEqual(emptySave());
  });

  it('keeps the good fields when one is nonsense', () => {
    writeSave({ ...emptySave(), best: 300, salvage: 500 });
    const broken = JSON.parse(storage.store.get('zs-save')!);
    broken.best = 'three hundred';
    broken.lifetime = 'gone';
    storage.store.set('zs-save', JSON.stringify(broken));

    const loaded = loadSave();

    expect(loaded.salvage).toBe(500); // untouched neighbour survives
    expect(loaded.best).toBe(0); // only the bad field falls back
    expect(loaded.lifetime).toEqual({ kills: 0, runs: 0, wins: 0 });
  });

  it('clamps values that are the right type but impossible', () => {
    writeSave(emptySave());
    const broken = JSON.parse(storage.store.get('zs-save')!);
    broken.settings.volume = 99;
    broken.salvage = -500;
    storage.store.set('zs-save', JSON.stringify(broken));

    const loaded = loadSave();

    expect(loaded.settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(loaded.salvage).toBe(0);
  });

  it('falls back to the backup when the live copy is destroyed', () => {
    writeSave({ ...emptySave(), best: 111 });
    writeSave({ ...emptySave(), best: 222 }); // pushes 111 into the backup
    storage.store.set('zs-save', 'corrupted beyond repair');

    expect(loadSave().best).toBe(111);
  });
});

describe('storage that refuses to co-operate', () => {
  it('reports a failed write instead of pretending', () => {
    storage.setFailing(true);
    expect(writeSave(emptySave())).toBe(false);
  });

  it('still hands back a usable profile when reads throw', () => {
    storage.setFailing(true);
    expect(loadSave()).toEqual(emptySave());
  });
});

describe('migrating the nine loose keys players already have', () => {
  it('carries a pre-versioning profile forward intact', () => {
    storage.store.set('zs-best', '265');
    storage.store.set('zs-operative', 'juggernaut');
    storage.store.set('zs-ach', JSON.stringify(['victory']));
    storage.store.set('zs-life', JSON.stringify({ kills: 5000, runs: 22, wins: 2 }));
    storage.store.set('zs-ops', JSON.stringify({ juggernaut: 640 }));
    storage.store.set('zs-daily', JSON.stringify({ '2026-09-12': { time: 180, kills: 900 } }));
    storage.store.set('zs-salvage', '430');
    storage.store.set('zs-talents', JSON.stringify({ vanguard: 2 }));
    storage.store.set('zs-settings', JSON.stringify({ volume: 0.3, muted: true }));

    const loaded = loadSave();

    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.best).toBe(265);
    expect(loaded.operative).toBe('juggernaut');
    expect(loaded.achievements).toEqual(['victory']);
    expect(loaded.lifetime).toEqual({ kills: 5000, runs: 22, wins: 2 });
    expect(loaded.operativeXp).toEqual({ juggernaut: 640 });
    expect(loaded.daily).toEqual({ '2026-09-12': { time: 180, kills: 900 } });
    expect(loaded.salvage).toBe(430);
    expect(loaded.talents).toEqual({ vanguard: 2 });
    expect(loaded.settings.volume).toBe(0.3);
    expect(loaded.settings.muted).toBe(true);
  });

  it('migrates a partial legacy profile without inventing the rest', () => {
    storage.store.set('zs-best', '90');
    const loaded = loadSave();
    expect(loaded.best).toBe(90);
    expect(loaded.talents).toEqual({});
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('does not mistake a corrupt legacy key for a missing one', () => {
    storage.store.set('zs-best', '120');
    storage.store.set('zs-talents', '{{{');
    const loaded = loadSave();
    expect(loaded.best).toBe(120); // the readable half still comes across
    expect(loaded.talents).toEqual({});
  });

  it('writes the migrated profile back, so the legacy keys stop being the source of truth', () => {
    storage.store.set('zs-best', '265');
    storage.store.set('zs-salvage', '430');

    loadSave();

    // Without this the consolidated save would only appear on the first unrelated write, and
    // a later corrupt read would fall through to stale legacy data instead of the backup.
    const written = JSON.parse(storage.store.get('zs-save')!);
    expect(written.best).toBe(265);
    expect(written.salvage).toBe(430);
    expect(written.version).toBe(SAVE_VERSION);
  });

  it('leaves the legacy keys alone, so an older build still finds them', () => {
    storage.store.set('zs-best', '265');
    loadSave();
    expect(storage.store.get('zs-best')).toBe('265');
  });

  it('prefers the versioned save once one exists', () => {
    storage.store.set('zs-best', '999');
    writeSave({ ...emptySave(), best: 10 });
    expect(loadSave().best).toBe(10);
  });
});

describe('clearing', () => {
  it('removes the versioned save, its backup and every legacy key', () => {
    storage.store.set('zs-best', '265');
    writeSave({ ...emptySave(), best: 1 });
    writeSave({ ...emptySave(), best: 2 });

    clearSave();

    expect(storage.store.size).toBe(0);
    expect(loadSave()).toEqual(emptySave());
  });
});

describe('a save from a newer build', () => {
  it('is read rather than discarded', () => {
    writeSave({ ...emptySave(), best: 77 });
    const future = JSON.parse(storage.store.get('zs-save')!);
    future.version = SAVE_VERSION + 5;
    future.unknownFutureField = { something: true };
    storage.store.set('zs-save', JSON.stringify(future));

    expect(loadSave().best).toBe(77);
  });
});
