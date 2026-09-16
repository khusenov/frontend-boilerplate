import type { ResolvedTheme } from './registry';
import type { SystemThemeSource } from './system-theme-source';

const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function createSystemThemeSource(): SystemThemeSource {
  const query = window.matchMedia(DARK_COLOR_SCHEME_QUERY);

  return {
    getCurrent: (): ResolvedTheme => (query.matches ? 'dark' : 'light'),

    subscribe: (onChange) => {
      query.addEventListener('change', onChange);

      return () => {
        query.removeEventListener('change', onChange);
      };
    },
  };
}
