import type { ThemePreference } from './registry';

export interface ThemePreferenceStorage {
  readonly read: () => ThemePreference | null;
  readonly write: (preference: ThemePreference) => void;
}
