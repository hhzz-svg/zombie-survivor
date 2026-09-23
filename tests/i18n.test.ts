import { describe, it, expect, afterEach } from 'vitest';
import { tr, lang, setLanguage, isLang, LANGUAGES, LANGUAGE_NAMES } from '../src/i18n';
import { SettingsSchema, DEFAULT_SETTINGS } from '../src/settings';

afterEach(() => setLanguage('zh'));

describe('tr', () => {
  it('returns the half matching the current language', () => {
    setLanguage('zh');
    expect(tr('设置', 'Settings')).toBe('设置');
    setLanguage('en');
    expect(tr('设置', 'Settings')).toBe('Settings');
  });

  it('defaults to Chinese, the source language', () => {
    expect(lang()).toBe('zh');
    expect(tr('中', 'en')).toBe('中');
  });
});

describe('isLang', () => {
  it('accepts the known languages and nothing else', () => {
    for (const l of LANGUAGES) expect(isLang(l)).toBe(true);
    for (const junk of ['EN', 'fr', '', null, undefined, 0, {}]) expect(isLang(junk)).toBe(false);
  });
});

describe('LANGUAGE_NAMES', () => {
  it('names every language, in that language', () => {
    for (const l of LANGUAGES) expect(LANGUAGE_NAMES[l]).toBeTruthy();
    expect(LANGUAGE_NAMES.zh).toBe('中文');
    expect(LANGUAGE_NAMES.en).toBe('English');
  });
});

describe('the language setting', () => {
  it('survives a round trip through the settings schema', () => {
    for (const l of LANGUAGES) {
      expect(SettingsSchema.parse({ ...DEFAULT_SETTINGS, language: l }).language).toBe(l);
    }
  });

  it('falls back instead of rejecting when the stored value is junk', () => {
    // Same contract as every other setting: a corrupt blob costs one option, not the profile.
    const parsed = SettingsSchema.parse({ ...DEFAULT_SETTINGS, language: 'klingon' });
    expect(isLang(parsed.language)).toBe(true);
    expect(parsed.volume).toBe(DEFAULT_SETTINGS.volume);
  });
});
