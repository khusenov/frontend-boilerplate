import { describe, expect, it, vi } from 'vitest';

import type { AccessToken } from './access-token';
import { toAccessToken } from './access-token';
import type { RefreshResult } from './refresh-result';
import { createSessionStore } from './session-store';
import { createSessionTokenSource } from './session-token-source';

const FRESH_TOKEN = toAccessToken('fresh-token');

function createStore(initialToken: AccessToken | null = null) {
  const store = createSessionStore();

  if (initialToken !== null) {
    store.start(initialToken);
  }

  return store;
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
    const store = createStore(toAccessToken('token-1'));
    const source = createSessionTokenSource({ store, refresh: resolving({ status: 'expired' }) });

    expect(source.getToken()).toBe('token-1');
  });

  it('treats the unknown state as tokenless and refreshes on the first request', async () => {
    const store = createStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    expect(source.getToken()).toBeNull();

    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('writes a renewed token to the store and hands it back', async () => {
    const store = createStore();
    const source = createSessionTokenSource({
      store,
      refresh: resolving({ status: 'refreshed', accessToken: FRESH_TOKEN }),
    });

    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: FRESH_TOKEN });
  });

  it('renews once for concurrent callers and resolves them all with the same token', async () => {
    const store = createStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(
      Promise.all([source.renewToken(null), source.renewToken(null), source.renewToken(null)]),
    ).resolves.toStrictEqual([FRESH_TOKEN, FRESH_TOKEN, FRESH_TOKEN]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: FRESH_TOKEN });
  });

  it('never renews again once the session has ended', async () => {
    const store = createStore(toAccessToken('token-1'));
    const refresh = resolving({ status: 'expired' });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.renewToken('token-1')).resolves.toBeNull();
    expect(store.read().status).toBe('anonymous');

    await expect(source.renewToken(null)).resolves.toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('hands the renewed token to a caller arriving after the renewal settled', async () => {
    const store = createStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    await expect(source.renewToken(null)).resolves.toBe(FRESH_TOKEN);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('returns the stored token without renewing when the store has already moved on', async () => {
    const store = createStore(toAccessToken('token-2'));
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.renewToken('token-1')).resolves.toBe('token-2');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('makes a caller carrying an older token wait for the renewal already in flight', async () => {
    const store = createStore(toAccessToken('token-1'));
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
    const store = createStore(toAccessToken('token-1'));
    const source = createSessionTokenSource({
      store,
      refresh: resolving({ status: 'unavailable' }),
    });

    await expect(source.renewToken('token-1')).resolves.toBeNull();
    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: 'token-1' });
  });

  it('resolves null rather than rejecting when the renewal itself fails', async () => {
    const store = createStore(toAccessToken('token-1'));
    const source = createSessionTokenSource({
      store,
      refresh: () => Promise.reject(new Error('the lock timed out')),
    });

    await expect(source.renewToken('token-1')).resolves.toBeNull();
    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: 'token-1' });
  });

  it('settles an unknown session with one refresh, and concurrent callers join it', async () => {
    const store = createStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(Promise.all([source.settle(), source.settle()])).resolves.toStrictEqual([
      'authenticated',
      'authenticated',
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('settles a live session without spending a refresh', async () => {
    const store = createStore(FRESH_TOKEN);
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });

    await expect(source.settle()).resolves.toBe('authenticated');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('never renews an ended session when asked to settle either', async () => {
    const store = createStore();
    const refresh = resolving({ status: 'refreshed', accessToken: FRESH_TOKEN });
    const source = createSessionTokenSource({ store, refresh });
    store.end();

    await expect(source.settle()).resolves.toBe('anonymous');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('retries the refresh on every settle while the session stays unresolved', async () => {
    const store = createStore();
    const refresh = resolving({ status: 'unavailable' });
    const source = createSessionTokenSource({ store, refresh });

    await source.settle();
    await source.settle();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
