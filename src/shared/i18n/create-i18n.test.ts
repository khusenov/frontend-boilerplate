import { describe, expect, it } from 'vitest';

import { createI18n } from './create-i18n';
import { DEFAULT_LOCALE } from './registry';

const LOCALE_STORAGE_KEY = 'app.locale';

const withoutDetection = { order: [], caches: [] };

describe('createI18n', () => {
  it('initializes synchronously with the default locale resolved', () => {
    const i18n = createI18n({ locale: DEFAULT_LOCALE, detection: withoutDetection });

    expect(i18n.isInitialized).toBe(true);
    expect(i18n.resolvedLanguage).toBe(DEFAULT_LOCALE);
    expect(i18n.t('notFound.title')).toBe('Page not found');
  });

  it('lets an explicit locale override detection', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

    const i18n = createI18n({ locale: 'ru' });

    expect(i18n.resolvedLanguage).toBe('ru');
  });

  it('switches to bundled russian shell copy without awaiting, then streams the home namespace', async () => {
    const i18n = createI18n({ locale: DEFAULT_LOCALE, detection: withoutDetection });

    const changed = i18n.changeLanguage('ru');

    expect(i18n.t('notFound.title')).toBe('Страница не найдена');

    await changed;
    await i18n.loadNamespaces('home');

    expect(i18n.getFixedT('ru', 'home')('addOneSecond')).toBe('Добавить секунду');
  });

  it('falls back to english for a persisted unsupported locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');

    const i18n = createI18n({ detection: { order: ['localStorage'], caches: [] } });

    expect(i18n.resolvedLanguage).toBe(DEFAULT_LOCALE);
    expect(i18n.t('notFound.title')).toBe('Page not found');
  });

  it('collapses a regional tag onto its base language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en-GB');

    const i18n = createI18n({ detection: { order: ['localStorage'], caches: [] } });

    expect(i18n.resolvedLanguage).toBe('en');
  });

  it('persists a language change under the application storage key and reads it back', async () => {
    const i18n = createI18n({ locale: DEFAULT_LOCALE });

    await i18n.changeLanguage('ru');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ru');
    expect(
      createI18n({ detection: { order: ['localStorage'], caches: [] } }).resolvedLanguage,
    ).toBe('ru');
  });

  it('selects the russian plural form that matches the count', async () => {
    const i18n = createI18n({ locale: 'ru', detection: withoutDetection });
    await i18n.loadNamespaces('home');

    const t = i18n.getFixedT('ru', 'home');

    expect(t('secondsAdded', { count: 1 })).toBe('Добавлена 1 секунда');
    expect(t('secondsAdded', { count: 3 })).toBe('Добавлено 3 секунды');
    expect(t('secondsAdded', { count: 5 })).toBe('Добавлено 5 секунд');
  });
});
