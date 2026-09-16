import { createContext, use, useSyncExternalStore } from 'react';

import type { ResolvedTheme, ThemePreference } from './registry';
import type { ThemeController } from './theme-controller';

export const ThemeContext = createContext<ThemeController | null>(null);

export interface UseThemeResult {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (preference: ThemePreference) => void;
}

function useThemeController(): ThemeController {
  const controller = use(ThemeContext);

  if (controller === null) {
    throw new Error('useTheme must be called inside a ThemeProvider');
  }

  return controller;
}

export function useTheme(): UseThemeResult {
  const controller = useThemeController();
  const { preference, resolved } = useSyncExternalStore(controller.subscribe, controller.getState);

  return { preference, resolved, setPreference: controller.setPreference };
}
