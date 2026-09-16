import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSystemThemeSource } from './create-system-theme-source';

function stubMatchMedia(matches: boolean) {
  const listeners = new Map<string, Set<() => void>>();
  const queries: string[] = [];

  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);

    return {
      matches,
      addEventListener: (type: string, listener: () => void) => {
        const registered = listeners.get(type) ?? new Set<() => void>();

        registered.add(listener);
        listeners.set(type, registered);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    };
  });

  return { listeners, queries };
}

describe('createSystemThemeSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the browser for the dark colour-scheme preference', () => {
    const { queries } = stubMatchMedia(false);

    createSystemThemeSource();

    expect(queries).toEqual(['(prefers-color-scheme: dark)']);
  });

  it('reports dark when the query matches', () => {
    stubMatchMedia(true);

    expect(createSystemThemeSource().getCurrent()).toBe('dark');
  });

  it('reports light when the query does not match', () => {
    stubMatchMedia(false);

    expect(createSystemThemeSource().getCurrent()).toBe('light');
  });

  it('registers a change listener and removes the same one on unsubscribe', () => {
    const { listeners } = stubMatchMedia(false);
    const onChange = vi.fn();

    const unsubscribe = createSystemThemeSource().subscribe(onChange);

    expect(listeners.get('change')?.has(onChange)).toBe(true);

    unsubscribe();

    expect(listeners.get('change')?.has(onChange)).toBe(false);
  });
});
