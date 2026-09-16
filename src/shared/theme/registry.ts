export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME_PREFERENCE = 'system' satisfies ThemePreference;

const THEME_PREFERENCE_SET: ReadonlySet<string> = new Set(THEME_PREFERENCES);

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCE_SET.has(value);
}
