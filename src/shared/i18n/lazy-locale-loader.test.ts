import { describe, expect, it } from 'vitest';

import { loadLocaleNamespace } from './lazy-locale-loader';
import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import ruCommon from './locales/ru/common.json';
import ruHome from './locales/ru/home.json';
import { DEFAULT_LOCALE, DEFAULT_NAMESPACE, SUPPORTED_LOCALES } from './registry';

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

const TRANSLATED_NAMESPACES = [
  { namespace: 'common', english: enCommon, russian: ruCommon },
  { namespace: 'home', english: enHome, russian: ruHome },
];

function flattenKeyFamilies(source: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    return typeof value === 'object' && value !== null
      ? flattenKeyFamilies(value as Record<string, unknown>, path)
      : [path.replace(PLURAL_SUFFIX, '')];
  });
}

describe('loadLocaleNamespace', () => {
  it('resolves a lazily loadable namespace', async () => {
    await expect(loadLocaleNamespace('ru', 'home')).resolves.toMatchObject({
      addOneSecond: 'Добавить секунду',
    });
  });

  it('rejects for an unknown language and for an unknown namespace', async () => {
    await expect(loadLocaleNamespace('de', 'home')).rejects.toThrow(
      'No lazily loadable translations for "de/home".',
    );
    await expect(loadLocaleNamespace('ru', 'about')).rejects.toThrow(
      'No lazily loadable translations for "ru/about".',
    );
  });

  it('rejects for the default locale, which ships whole', async () => {
    await expect(loadLocaleNamespace(DEFAULT_LOCALE, 'home')).rejects.toThrow(
      'No lazily loadable translations',
    );
  });

  it('rejects for the shell namespace in every supported locale, which is always bundled', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      await expect(loadLocaleNamespace(locale, DEFAULT_NAMESPACE)).rejects.toThrow(
        'No lazily loadable translations',
      );
    }
  });

  it('translates every english key family in russian', () => {
    for (const { namespace, english, russian } of TRANSLATED_NAMESPACES) {
      const russianKeyFamilies = new Set(flattenKeyFamilies(russian));

      for (const keyFamily of flattenKeyFamilies(english)) {
        expect(russianKeyFamilies, `${namespace}:${keyFamily}`).toContain(keyFamily);
      }
    }
  });
});
