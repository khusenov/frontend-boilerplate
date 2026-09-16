import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedTheme, ThemePreference } from './registry';
import type { SystemThemeSource } from './system-theme-source';
import { useTheme } from './theme-context';
import { createThemeController } from './theme-controller';
import type { ThemeController } from './theme-controller';
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
  const writes: ThemePreference[] = [];
  const storage: ThemePreferenceStorage = {
    read: () => stored,
    write: (preference) => {
      writes.push(preference);
    },
  };
  const { systemTheme, flipTo } = createSystemThemeFake(system);

  return { controller: createThemeController({ storage, systemTheme }), writes, flipTo };
}

function createWrapper(controller: ThemeController) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider controller={controller} applyTheme={() => undefined}>
        {children}
      </ThemeProvider>
    );
  };
}

describe('useTheme', () => {
  it('returns the controller preference and resolved theme', () => {
    const { controller } = createControllerFake(null, 'dark');

    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(controller) });

    expect(result.current.preference).toBe('system');
    expect(result.current.resolved).toBe('dark');
  });

  it('re-renders when the controller transitions', () => {
    const { controller, flipTo } = createControllerFake(null, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(controller) });

    act(() => {
      flipTo('dark');
    });

    expect(result.current.resolved).toBe('dark');
  });

  it('reaches the controller when a caller sets a preference', () => {
    const { controller, writes } = createControllerFake(null, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(controller) });

    act(() => {
      result.current.setPreference('dark');
    });

    expect(writes).toEqual(['dark']);
    expect(result.current.preference).toBe('dark');
  });

  it('fails loudly when no provider is above it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be called inside a ThemeProvider',
    );

    consoleError.mockRestore();
  });
});
