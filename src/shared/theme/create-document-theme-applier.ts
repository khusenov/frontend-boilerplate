import type { ResolvedTheme } from './registry';
import type { ThemeApplier } from './theme-applier';

const DARK_THEME_CLASS_NAME = 'dark';

export function createDocumentThemeApplier(
  element: HTMLElement = document.documentElement,
): ThemeApplier {
  return (resolved: ResolvedTheme) => {
    element.style.colorScheme = resolved;

    if (resolved === 'dark') {
      element.classList.add(DARK_THEME_CLASS_NAME);
      return;
    }

    element.classList.remove(DARK_THEME_CLASS_NAME);
  };
}
