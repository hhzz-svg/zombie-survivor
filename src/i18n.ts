/**
 * Two-language text, chosen once per page load.
 *
 * The API is a *pair*, not a key: `tr('威胁：高', 'Threat: High')`. There is deliberately no
 * key namespace, because a key namespace is a second thing to keep in sync and its failure
 * mode — a key that resolves to nothing — only shows up at runtime, in the language nobody
 * on the team is reading. With a pair, both halves are right there at the call site, the
 * compiler guarantees neither is missing, and the Chinese stays readable in the data tables
 * where it belongs.
 *
 * The one rule: `setLanguage()` must run before the game modules are imported, because the
 * data tables call `tr()` at module scope. `src/main.ts` does that, then dynamically imports
 * the game. Switching language therefore reloads the page — which is normal for a game and
 * is what keeps every other call site free of subscriptions and re-render plumbing.
 */

export const LANGUAGES = ['zh', 'en'] as const;
export type Lang = (typeof LANGUAGES)[number];

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

/**
 * Each language named in itself — a picker that says "Chinese" in English is useless to
 * someone who cannot read English. These are the one kind of string that must never be
 * translated, hence the audit pragma.
 */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  zh: '中文', /* i18n-exempt */
  en: 'English',
};

let current: Lang = 'zh';

export function setLanguage(l: Lang): void {
  current = l;
}

export function lang(): Lang {
  return current;
}

/** Pick the half that matches the current language. */
export function tr(zh: string, en: string): string {
  return current === 'en' ? en : zh;
}

/**
 * The language to start in when the player has never chosen one. Chinese is the source
 * language, so anything that is not clearly an English-speaking locale stays on it.
 */
export function detectLanguage(): Lang {
  const nav = typeof navigator === 'undefined' ? undefined : navigator.language;
  return nav && /^en\b/i.test(nav) ? 'en' : 'zh';
}
