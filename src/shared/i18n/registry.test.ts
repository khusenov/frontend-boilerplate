import { describe, expect, it } from 'vitest';

import { BUNDLED_RESOURCES } from './bundled-resources';
import {
  DEFAULT_LOCALE,
  DEFAULT_NAMESPACE,
  isSupportedLocale,
  LOCALES,
  NAMESPACES,
  SUPPORTED_LOCALES,
} from './registry';

describe('registry', () => {
  it('defaults to a supported locale and an existing namespace', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expect(NAMESPACES).toContain(DEFAULT_NAMESPACE);
  });

  it('describes every supported locale with a label and a text direction', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALES[locale].label).not.toBe('');
      expect(['ltr', 'rtl']).toContain(LOCALES[locale].dir);
    }
  });

  it('bundles shell copy for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(BUNDLED_RESOURCES[locale][DEFAULT_NAMESPACE]).toBeDefined();
    }
  });

  it('accepts every supported locale code', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it('rejects an unknown code, an empty string, and undefined', () => {
    expect(isSupportedLocale('de')).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});
