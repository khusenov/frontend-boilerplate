import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedTheme, ThemePreference } from './registry';
import type { SystemThemeSource } from './system-theme-source';
import { useTheme } from './theme-context';
import { createThemeController } from './theme-controller';
import type { ThemePreferenceStorage } from './theme-preference-storage';
import { ThemeProvider } from './theme-provider';

function createSystemThemeFake(initial: ResolvedTheme) {
  let current = initial;
  const listeners = new Set<() => void>();

  const systemTheme: SystemThemeSource = {
    getCurrent: () => current,
    subscribe: (onChange) => {
      listeners.add(onChange);

      return () => {
        listeners.delete(onChange);
      };
    },
  };

  function flipTo(next: ResolvedTheme) {
    current = next;

    for (const listener of [...listeners]) {
      listener();
    }
  }

  return { systemTheme, flipTo };
}

function createControllerFake(stored: ThemePreference | null, system: ResolvedTheme) {
  const storage: ThemePreferenceStorage = { read: () => stored, write: () => undefined };
  const { systemTheme, flipTo } = createSystemThemeFake(system);

  return { controller: createThemeController({ storage, systemTheme }), flipTo };
}

function ThemeProbe() {
  const { resolved, setPreference } = useTheme();

  return (
    <button
      type="button"
      onClick={() => {
        setPreference('dark');
      }}
    >
      {resolved}
    </button>
  );
}

describe('ThemeProvider', () => {
  it('renders its children', () => {
    const { controller } = createControllerFake(null, 'light');

    render(
      <ThemeProvider controller={controller} applyTheme={vi.fn()}>
        <p>child content</p>
      </ThemeProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('applies the resolved theme on mount', () => {
    const { controller } = createControllerFake(null, 'dark');
    const applyTheme = vi.fn();

    render(
      <ThemeProvider controller={controller} applyTheme={applyTheme}>
        <p>child content</p>
      </ThemeProvider>,
    );

    expect(applyTheme).toHaveBeenCalledWith('dark');
  });

  it('applies the resolved theme again when the preference changes', () => {
    const { controller } = createControllerFake(null, 'light');
    const applyTheme = vi.fn();

    render(
      <ThemeProvider controller={controller} applyTheme={applyTheme}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(applyTheme).toHaveBeenLastCalledWith('light');

    act(() => {
      controller.setPreference('dark');
    });

    expect(applyTheme).toHaveBeenLastCalledWith('dark');
  });

  it('carries an operating-system flip through to the document', () => {
    const { controller, flipTo } = createControllerFake(null, 'light');
    const applyTheme = vi.fn();

    render(
      <ThemeProvider controller={controller} applyTheme={applyTheme}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');

    act(() => {
      flipTo('dark');
    });

    expect(applyTheme).toHaveBeenLastCalledWith('dark');
    expect(screen.getByRole('button')).toHaveTextContent('dark');
  });
});
