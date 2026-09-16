import { describe, expect, it, vi } from 'vitest';

import type { ResolvedTheme, ThemePreference } from './registry';
import type { SystemThemeSource } from './system-theme-source';
import { createThemeController } from './theme-controller';
import type { ThemePreferenceStorage } from './theme-preference-storage';

function createStorageFake(initial: ThemePreference | null = null) {
  const writes: ThemePreference[] = [];

  const storage: ThemePreferenceStorage = {
    read: () => initial,
    write: (preference) => {
      writes.push(preference);
    },
  };

  return { storage, writes };
}

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

  function set(next: ResolvedTheme) {
    current = next;
  }

  function emit() {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  return { systemTheme, set, emit, listeners };
}

describe('createThemeController', () => {
  it('follows the system when nothing is stored', () => {
    const { storage } = createStorageFake();
    const { systemTheme } = createSystemThemeFake('dark');

    const controller = createThemeController({ storage, systemTheme });

    expect(controller.getState()).toEqual({ preference: 'system', resolved: 'dark' });
  });

  it('honours a stored preference over the system one', () => {
    const { storage } = createStorageFake('dark');
    const { systemTheme } = createSystemThemeFake('light');

    const controller = createThemeController({ storage, systemTheme });

    expect(controller.getState()).toEqual({ preference: 'dark', resolved: 'dark' });
  });

  it('persists an explicit preference and moves the resolved theme', () => {
    const { storage, writes } = createStorageFake();
    const { systemTheme } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });

    controller.setPreference('dark');

    expect(writes).toEqual(['dark']);
    expect(controller.getState()).toEqual({ preference: 'dark', resolved: 'dark' });
  });

  it('ignores a preference that is already active', () => {
    const { storage, writes } = createStorageFake('light');
    const { systemTheme } = createSystemThemeFake('dark');
    const controller = createThemeController({ storage, systemTheme });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setPreference('light');

    expect(writes).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('re-derives from the system source when the preference returns to system', () => {
    const { storage } = createStorageFake('light');
    const { systemTheme } = createSystemThemeFake('dark');
    const controller = createThemeController({ storage, systemTheme });

    controller.setPreference('system');

    expect(controller.getState()).toEqual({ preference: 'system', resolved: 'dark' });
  });

  it('reports the current system theme even with no subscriber', () => {
    const { storage } = createStorageFake();
    const { systemTheme, set } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });

    set('dark');

    expect(controller.getState().resolved).toBe('dark');
  });

  it('keeps one snapshot identity until something actually changes', () => {
    const { storage } = createStorageFake();
    const { systemTheme, set } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });

    const first = controller.getState();

    expect(controller.getState()).toBe(first);

    set('dark');

    expect(controller.getState()).not.toBe(first);
  });

  it('opens the system subscription on the first listener and closes it on the last', () => {
    const { storage } = createStorageFake();
    const { systemTheme, listeners } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });

    const unsubscribe = controller.subscribe(vi.fn());

    expect(listeners.size).toBe(1);

    unsubscribe();

    expect(listeners.size).toBe(0);
  });

  it('re-opens the system subscription after a full unsubscribe', () => {
    const { storage } = createStorageFake();
    const { systemTheme, listeners } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });

    controller.subscribe(vi.fn())();
    controller.subscribe(vi.fn());

    expect(listeners.size).toBe(1);
  });

  it('opens exactly one system subscription for a listener registered twice', () => {
    const { storage } = createStorageFake();
    const { systemTheme, listeners, emit } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });
    const listener = vi.fn();

    controller.subscribe(listener);
    controller.subscribe(listener);

    expect(listeners.size).toBe(1);

    emit();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('flips the resolved theme when the system changes while following it', () => {
    const { storage } = createStorageFake();
    const { systemTheme, set, emit } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });
    const listener = vi.fn();
    controller.subscribe(listener);

    set('dark');
    emit();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getState().resolved).toBe('dark');
  });

  it('holds an explicit preference when the system changes underneath it', () => {
    const { storage } = createStorageFake('light');
    const { systemTheme, set, emit } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });
    const listener = vi.fn();
    controller.subscribe(listener);

    set('dark');
    emit();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getState().resolved).toBe('light');
  });

  it('notifies a listener that an earlier one unsubscribed mid-notification', () => {
    const { storage } = createStorageFake();
    const { systemTheme, emit } = createSystemThemeFake('light');
    const controller = createThemeController({ storage, systemTheme });
    const later = vi.fn();
    let unsubscribeLater = () => undefined as void;

    controller.subscribe(() => {
      unsubscribeLater();
    });
    unsubscribeLater = controller.subscribe(later);

    expect(() => {
      emit();
    }).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
