import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserThemeStorage } from './create-browser-theme-storage';

const STORAGE_KEY = 'app.theme';

describe('createBrowserThemeStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a stored preference', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');

    expect(createBrowserThemeStorage().read()).toBe('dark');
  });

  it('reads null when nothing is stored', () => {
    expect(createBrowserThemeStorage().read()).toBeNull();
  });

  it('reads null when the stored value is not a preference', () => {
    localStorage.setItem(STORAGE_KEY, 'twilight');

    expect(createBrowserThemeStorage().read()).toBeNull();
  });

  it('persists a preference under the app.theme key', () => {
    createBrowserThemeStorage().write('light');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('reads null instead of throwing when storage access is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => undefined,
    });

    expect(createBrowserThemeStorage().read()).toBeNull();
  });

  it('swallows a write that the browser refuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });

    expect(() => {
      createBrowserThemeStorage().write('dark');
    }).not.toThrow();
  });
});
