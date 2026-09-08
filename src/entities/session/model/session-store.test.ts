import { describe, expect, it, vi } from 'vitest';

import { toAccessToken } from './access-token';
import type { SessionState } from './session-state';
import { createSessionStore, toSessionObserver } from './session-store';

const TOKEN = toAccessToken('token-1');
const OTHER_TOKEN = toAccessToken('token-2');

describe('createSessionStore', () => {
  it('starts in the unknown state before anything happens', () => {
    const store = createSessionStore();

    expect(store.read()).toStrictEqual({ status: 'unknown' });
  });

  it('moves to authenticated and carries the token when a session starts', () => {
    const store = createSessionStore();

    store.start(TOKEN);

    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: TOKEN });
  });

  it('moves to anonymous when a session ends', () => {
    const store = createSessionStore();
    store.start(TOKEN);

    store.end();

    expect(store.read()).toStrictEqual({ status: 'anonymous' });
  });

  it('reopens an authenticated session after one has ended', () => {
    const store = createSessionStore();
    store.end();

    store.start(TOKEN);

    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: TOKEN });
  });

  it('replaces the token when a different one is granted', () => {
    const store = createSessionStore();
    store.start(TOKEN);

    store.start(OTHER_TOKEN);

    expect(store.read()).toStrictEqual({ status: 'authenticated', accessToken: OTHER_TOKEN });
  });

  it('notifies every subscriber when a different token replaces the current one', () => {
    const store = createSessionStore();
    store.start(TOKEN);
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.start(OTHER_TOKEN);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('returns the identical state object on repeated reads', () => {
    const store = createSessionStore();
    store.start(TOKEN);

    expect(store.read()).toBe(store.read());
  });

  it('returns the identical state object when the same token is granted twice', () => {
    const store = createSessionStore();
    store.start(TOKEN);
    const first = store.read();

    store.start(TOKEN);

    expect(store.read()).toBe(first);
  });

  it('returns the identical anonymous object across two separate ends', () => {
    const store = createSessionStore();
    store.end();
    const first = store.read();

    store.start(TOKEN);
    store.end();

    expect(store.read()).toBe(first);
  });

  it('notifies every subscriber when a session starts', () => {
    const store = createSessionStore();
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.start(TOKEN);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('notifies every subscriber when a session ends', () => {
    const store = createSessionStore();
    store.start(TOKEN);
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.end();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('exposes the new state to a listener at the moment it is notified', () => {
    const store = createSessionStore();
    const seen: SessionState[] = [];
    store.subscribe(() => {
      seen.push(store.read());
    });

    store.start(TOKEN);
    store.end();

    expect(seen).toStrictEqual([
      { status: 'authenticated', accessToken: TOKEN },
      { status: 'anonymous' },
    ]);
  });

  it('notifies nobody when the same token is granted twice', () => {
    const store = createSessionStore();
    store.start(TOKEN);
    const listener = vi.fn();
    store.subscribe(listener);

    store.start(TOKEN);

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies nobody when an already ended session ends again', () => {
    const store = createSessionStore();
    store.end();
    const listener = vi.fn();
    store.subscribe(listener);

    store.end();

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const store = createSessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.start(TOKEN);

    expect(listener).not.toHaveBeenCalled();
  });

  it('leaves the remaining listeners subscribed when one unsubscribes', () => {
    const store = createSessionStore();
    const kept = vi.fn();
    const dropped = vi.fn();
    store.subscribe(kept);
    store.subscribe(dropped)();

    store.start(TOKEN);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('delivers to a listener that a previously notified listener unsubscribed during the same publish', () => {
    const store = createSessionStore();
    const late = vi.fn();
    let unsubscribeLate: (() => void) | null = null;
    store.subscribe(() => {
      unsubscribeLate?.();
    });
    unsubscribeLate = store.subscribe(late);

    store.start(TOKEN);

    expect(late).toHaveBeenCalledTimes(1);

    store.end();

    expect(late).toHaveBeenCalledTimes(1);
  });

  it('ignores a repeated unsubscribe call', () => {
    const store = createSessionStore();
    const kept = vi.fn();
    const unsubscribe = store.subscribe(vi.fn());
    store.subscribe(kept);

    unsubscribe();
    unsubscribe();
    store.start(TOKEN);

    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('gives each store its own state and its own listeners', () => {
    const first = createSessionStore();
    const second = createSessionStore();
    const listener = vi.fn();
    second.subscribe(listener);

    first.start(TOKEN);

    expect(second.read()).toStrictEqual({ status: 'unknown' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('toSessionObserver', () => {
  it('reports the store current status', () => {
    const store = createSessionStore();
    const observer = toSessionObserver(store);

    expect(observer.status()).toBe('unknown');

    store.start(TOKEN);

    expect(observer.status()).toBe('authenticated');

    store.end();

    expect(observer.status()).toBe('anonymous');
  });

  it('exposes no way to read the token or change the session', () => {
    const observer = toSessionObserver(createSessionStore());

    expect(Object.keys(observer).toSorted()).toStrictEqual(['status', 'subscribe']);
  });

  it('forwards a subscription to the store and returns its unsubscribe', () => {
    const store = createSessionStore();
    const observer = toSessionObserver(store);
    const listener = vi.fn();

    const unsubscribe = observer.subscribe(listener);
    store.start(TOKEN);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.end();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
