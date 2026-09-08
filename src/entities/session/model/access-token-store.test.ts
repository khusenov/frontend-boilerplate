import { describe, expect, it } from 'vitest';

import { toAccessToken } from './access-token';
import { createAccessTokenStore } from './access-token-store';

describe('createAccessTokenStore', () => {
  it('holds no token and reports an unfinished session before the first write', () => {
    const store = createAccessTokenStore();

    expect(store.read()).toBeNull();
    expect(store.hasEnded()).toBe(false);
  });

  it('keeps the written token and leaves the session open', () => {
    const store = createAccessTokenStore();

    store.write(toAccessToken('token-1'));

    expect(store.read()).toBe('token-1');
    expect(store.hasEnded()).toBe(false);
  });

  it('drops the token and latches the session as ended when cleared', () => {
    const store = createAccessTokenStore();
    store.write(toAccessToken('token-1'));

    store.clear();

    expect(store.read()).toBeNull();
    expect(store.hasEnded()).toBe(true);
  });

  it('reopens the session when a token is written after a clear', () => {
    const store = createAccessTokenStore();
    store.clear();

    store.write(toAccessToken('token-2'));

    expect(store.read()).toBe('token-2');
    expect(store.hasEnded()).toBe(false);
  });

  it('gives each store its own state', () => {
    const first = createAccessTokenStore();
    const second = createAccessTokenStore();

    first.write(toAccessToken('token-1'));

    expect(second.read()).toBeNull();
    expect(second.hasEnded()).toBe(false);
  });
});
