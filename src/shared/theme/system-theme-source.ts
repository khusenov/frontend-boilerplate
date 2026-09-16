import type { ResolvedTheme } from './registry';

export interface SystemThemeSource {
  readonly getCurrent: () => ResolvedTheme;
  readonly subscribe: (onChange: () => void) => () => void;
}
