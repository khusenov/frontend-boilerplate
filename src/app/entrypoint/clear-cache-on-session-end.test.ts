import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { SessionObserver, SessionStatus } from '@/entities/session';

import { clearCacheOnSessionEnd } from './clear-cache-on-session-end';

const PROBE_KEY = ['probe'];

function createFakeSession(initialStatus: SessionStatus) {
  let status = initialStatus;
  const listeners = new Set<() => void>();

  const observer: SessionObserver = {
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  function moveTo(next: SessionStatus) {
    status = next;

    for (const listener of [...listeners]) {
      listener();
    }
  }

  return { observer, moveTo };
}

function createSeededCache() {
  const cache = new QueryClient();
  cache.setQueryData(PROBE_KEY, 'value');

  return cache;
}

describe('clearCacheOnSessionEnd', () => {
  it('clears the cache when an authenticated session ends', () => {
    const { observer, moveTo } = createFakeSession('authenticated');
    const cache = createSeededCache();
    clearCacheOnSessionEnd(observer, cache);

    moveTo('anonymous');

    expect(cache.getQueryData(PROBE_KEY)).toBeUndefined();
  });

  it('clears the cache when a different session replaces the current one', () => {
    const { observer, moveTo } = createFakeSession('authenticated');
    const cache = createSeededCache();
    clearCacheOnSessionEnd(observer, cache);

    moveTo('authenticated');

    expect(cache.getQueryData(PROBE_KEY)).toBeUndefined();
  });

  it('leaves the cache untouched when the first session starts', () => {
    const { observer, moveTo } = createFakeSession('unknown');
    const cache = createSeededCache();
    clearCacheOnSessionEnd(observer, cache);

    moveTo('authenticated');

    expect(cache.getQueryData(PROBE_KEY)).toBe('value');
  });

  it('leaves the cache untouched when a bootstrap refresh finds no session', () => {
    const { observer, moveTo } = createFakeSession('unknown');
    const cache = createSeededCache();
    clearCacheOnSessionEnd(observer, cache);

    moveTo('anonymous');

    expect(cache.getQueryData(PROBE_KEY)).toBe('value');
  });

  it('stops clearing once the returned unsubscribe is called', () => {
    const { observer, moveTo } = createFakeSession('authenticated');
    const cache = createSeededCache();
    const unsubscribe = clearCacheOnSessionEnd(observer, cache);

    unsubscribe();
    moveTo('anonymous');

    expect(cache.getQueryData(PROBE_KEY)).toBe('value');
  });
});
