import { useEffect } from 'react';
import type { ReactNode } from 'react';

import type { ThemeApplier } from './theme-applier';
import { ThemeContext, useTheme } from './theme-context';
import type { ThemeController } from './theme-controller';

interface ThemeProviderProps {
  readonly controller: ThemeController;
  readonly applyTheme: ThemeApplier;
  readonly children: ReactNode;
}

function DocumentThemeSync({ applyTheme }: { readonly applyTheme: ThemeApplier }) {
  const { resolved } = useTheme();

  useEffect(() => {
    applyTheme(resolved);
  }, [applyTheme, resolved]);

  return null;
}

export function ThemeProvider({ controller, applyTheme, children }: ThemeProviderProps) {
  return (
    <ThemeContext value={controller}>
      <DocumentThemeSync applyTheme={applyTheme} />
      {children}
    </ThemeContext>
  );
}
