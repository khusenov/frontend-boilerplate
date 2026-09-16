import { DEFAULT_THEME_PREFERENCE } from './registry';
import type { ResolvedTheme, ThemePreference } from './registry';
import type { SystemThemeSource } from './system-theme-source';
import type { ThemePreferenceStorage } from './theme-preference-storage';

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
}

export interface ThemeController {
  readonly getState: () => ThemeState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setPreference: (preference: ThemePreference) => void;
}

export interface CreateThemeControllerOptions {
  readonly storage: ThemePreferenceStorage;
  readonly systemTheme: SystemThemeSource;
}

export function createThemeController({
  storage,
  systemTheme,
}: CreateThemeControllerOptions): ThemeController {
  const listeners = new Set<() => void>();

  let preference = storage.read() ?? DEFAULT_THEME_PREFERENCE;
  let unsubscribeFromSystem: (() => void) | undefined;

  function resolve(): ResolvedTheme {
    return preference === 'system' ? systemTheme.getCurrent() : preference;
  }

  let snapshot: ThemeState = { preference, resolved: resolve() };

  function notify(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function openSystemSubscription(): void {
    unsubscribeFromSystem = systemTheme.subscribe(notify);
  }

  function closeSystemSubscription(): void {
    unsubscribeFromSystem?.();
    unsubscribeFromSystem = undefined;
  }

  return {
    getState: () => {
      const resolved = resolve();

      if (snapshot.preference !== preference || snapshot.resolved !== resolved) {
        snapshot = { preference, resolved };
      }

      return snapshot;
    },

    subscribe: (listener) => {
      if (listeners.size === 0) {
        openSystemSubscription();
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          closeSystemSubscription();
        }
      };
    },

    setPreference: (next) => {
      if (next === preference) {
        return;
      }

      preference = next;
      storage.write(next);
      notify();
    },
  };
}
