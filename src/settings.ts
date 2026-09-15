import { z } from 'zod';
import { LANGUAGES, detectLanguage, type Lang } from './i18n';

/**
 * Player-facing options. Purely presentational — nothing here touches the simulation, so a
 * run stays reproducible whatever the settings are (which is what lets a shared seed mean
 * the same thing on two different machines).
 *
 * Persistence lives in `save.ts`; this module only owns the shape and its defaults.
 */

export const DEFAULT_SETTINGS: {
  volume: number; muted: boolean; shake: number;
  reduceFlashing: boolean; damageNumbers: boolean; language: Lang;
} = {
  language: detectLanguage(),
  volume: 0.8,
  muted: false,
  shake: 1,
  reduceFlashing: false,
  damageNumbers: true,
};

const unit = () => z.number().min(0).max(1);

/**
 * Every field clamps or falls back rather than rejecting: a hand-edited or partially written
 * settings blob should cost the player one option, never their whole profile.
 */
export const SettingsSchema = z.object({
  /**
   * UI language. Read once at startup by `src/main.ts`, before the game modules load —
   * see i18n.ts for why changing it reloads the page.
   */
  language: z.enum(LANGUAGES).catch(() => detectLanguage()),
  volume: unit().catch(DEFAULT_SETTINGS.volume),
  muted: z.boolean().catch(DEFAULT_SETTINGS.muted),
  /** 0 disables screen shake entirely. */
  shake: unit().catch(DEFAULT_SETTINGS.shake),
  /** Dampens the blood-moon pulse, combo glow and low-HP vignette — a photosensitivity guard. */
  reduceFlashing: z.boolean().catch(DEFAULT_SETTINGS.reduceFlashing),
  damageNumbers: z.boolean().catch(DEFAULT_SETTINGS.damageNumbers),
}).catch({ ...DEFAULT_SETTINGS });

export type Settings = z.infer<typeof SettingsSchema>;
