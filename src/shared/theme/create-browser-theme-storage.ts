import { isThemePreference } from './registry';
import type { ThemePreference } from './registry';
import type { ThemePreferenceStorage } from './theme-preference-storage';

const THEME_PREFERENCE_STORAGE_KEY = 'app.theme';

export function createBrowserThemeStorage(): ThemePreferenceStorage {
  return {
    read: (): ThemePreference | null => {
      try {
        const stored = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);

        return isThemePreference(stored) ? stored : null;
      } catch {
        // Blocked site data throws from the localStorage getter, not from getItem.
        return null;
      }
    },

    write: (preference) => {
      try {
        window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
      } catch {
        // Persistence is a convenience; a browser that denies it must still switch themes.
      }
    },
  };
}
