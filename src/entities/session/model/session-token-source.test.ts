import { describe, expect, it, vi } from 'vitest';

import type { AccessToken } from './access-token';
import { toAccessToken } from './access-token';
import type { AccessTokenStore } from './access-token-store';
import type { RefreshResult } from './refresh-result';
import { createSessionTokenSource } from './session-token-source';

const FRESH_TOKEN = toAccessToken('fresh-token');

function createFakeStore(initialToken: AccessToken | null = null) {
  let accessToken = initialToken;
  let ended = false;
  const writes: AccessToken[] = [];

  const store: AccessTokenStore = {
    read: () => accessToken,
    hasEnded: () => ended,
    write: (value) => {
      accessToken = value;
      ended = false;
      writes.push(value);
    },
    clear: () => {
      accessToken = null;
      ended = true;
    },
  };

  return { store, writes };
}

function resolving(result: RefreshResult) {
  return vi.fn(() => Promise.resolve(result));
}

function createDeferredRefresh() {
  let settle!: (result: RefreshResult) => void;
  const promise = new Promise<RefreshResult>((resolve) => {
    settle = resolve;
  });

  return { refresh: vi.fn(() => promise), settle };
}

describe('createSessionTokenSource', () => {
  it('reads the current token straight from the store', () => {
    const { store } = createFakeStore(toAccessToken('token-1'));
    const source = createSessionTokenSource({ store, refresh: resolving({ status: 'expired' }) });

    expect(source.getToken()).toBe('token-1');
  });

  it('writes a renewed token to the store and hands it back', async () => {
    const { store } = createFakeStore();
    const source = createSessionTokenSource({
      store,
      refresh: resolving({ status: 'refreshed', accessToken: FRESH_TOKEN }),
    });

    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    expect(store.read()).toBe(FRESH_TOKEN);
  });

  it('renews once for concurrent callers and resolves them all with the same token', async () => {
    const { store, writes } = createFakeStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(
      Promise.all([source.renewToken(null), source.renewToken(null), source.renewToken(null)]),
    ).resolves.toStrictEqual([FRESH_TOKEN, FRESH_TOKEN, FRESH_TOKEN]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(writes).toStrictEqual([FRESH_TOKEN]);
  });

  it('never renews again once the session has ended', async () => {
    const { store } = createFakeStore(toAccessToken('token-1'));
    const refresh = resolving({ status: 'expired' });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.renewToken('token-1')).resolves.toBeNull();
    expect(store.hasEnded()).toBe(true);

    await expect(source.renewToken(null)).resolves.toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('hands the renewed token to a caller arriving after the renewal settled', async () => {
    const { store } = createFakeStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('returns the stored token without renewing when the store has already moved on', async () => {
    const { store } = createFakeStore(toAccessToken('token-2'));
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.renewToken('token-1')).resolves.toBe('token-2');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('makes a caller carrying an older token wait for the renewal already in flight', async () => {
    const { store } = createFakeStore(toAccessToken('token-1'));
    const { refresh, settle } = createDeferredRefresh();
    const source = createSessionTokenSource({ store, refresh });

    const joined = source.renewToken('token-1');
    const late = source.renewToken('token-0');

    settle({ status: 'refreshed', accessToken: FRESH_TOKEN });

    await expect(joined).resolves.toBe(FRESH_TOKEN);
    await expect(late).resolves.toBe(FRESH_TOKEN);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the token and the open session when a renewal is merely unavailable', async () => {
    const { store } = createFakeStore(toAccessToken('token-1'));
    const source = createSessionTokenSource({
      store,
      refresh: resolving({ status: 'unavailable' }),
    });

    await expect(source.renewToken('token-1')).resolves.toBeNull();
    expect(store.read()).toBe('token-1');
    expect(store.hasEnded()).toBe(false);
  });

  it('resolves null rather than rejecting when the renewal itself fails', async () => {
    const { store } = createFakeStore(toAccessToken('token-1'));
    const source = createSessionTokenSource({
      store,
      refresh: () => Promise.reject(new Error('the lock timed out')),
    });

    await expect(source.renewToken('token-1')).resolves.toBeNull();
    expect(store.read()).toBe('token-1');
  });
});
