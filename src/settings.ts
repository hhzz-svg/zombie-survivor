/**
 * Player-facing options. Purely presentational — nothing here touches the simulation, so a
 * run stays reproducible whatever the settings are (which is what lets a shared seed mean
 * the same thing on two different machines).
 */
export interface Settings {
  volume: number; // 0..1 master gain
  muted: boolean;
  shake: number; // 0..1 screen-shake scale; 0 disables it entirely
  /** Dampens the blood-moon pulse, combo glow and low-HP vignette — a photosensitivity guard. */
  reduceFlashing: boolean;
  damageNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  muted: false,
  shake: 1,
  reduceFlashing: false,
  damageNumbers: true,
};

const KEY = 'zs-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: clamp01(parsed.volume ?? DEFAULT_SETTINGS.volume),
      muted: !!parsed.muted,
      shake: clamp01(parsed.shake ?? DEFAULT_SETTINGS.shake),
      reduceFlashing: !!parsed.reduceFlashing,
      damageNumbers: parsed.damageNumbers !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage disabled — settings just don't persist
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 1));
}
