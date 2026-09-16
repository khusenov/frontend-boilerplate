import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME_PREFERENCE, isThemePreference, THEME_PREFERENCES } from './registry';

describe('registry', () => {
  it('defaults to a supported preference', () => {
    expect(THEME_PREFERENCES).toContain(DEFAULT_THEME_PREFERENCE);
  });

  it.each(THEME_PREFERENCES)('accepts the supported preference %s', (preference) => {
    expect(isThemePreference(preference)).toBe(true);
  });

  it('rejects an unknown value, an empty string, null and undefined', () => {
    expect(isThemePreference('twilight')).toBe(false);
    expect(isThemePreference('')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});
