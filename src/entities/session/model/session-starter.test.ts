import { describe, expect, it } from 'vitest';

import { toAccessToken } from './access-token';
import type { AccessToken } from './access-token';
import { createSessionStarter } from './session-starter';
import type { SessionStartTarget } from './session-starter';
import type { SessionStatus } from './session-state';
import { createSessionStore } from './session-store';
import type { SignInResult } from './sign-in-result';

const credentials = { email: 'ada@example.com', password: 'correct horse' };
const issuedToken = toAccessToken('issued-token');

function createStoreSpy() {
  const started: AccessToken[] = [];

  const store: SessionStartTarget = {
    start: (accessToken) => {
      started.push(accessToken);
    },
  };

  return { started, store };
}

function createStarter(result: SignInResult) {
  const { started, store } = createStoreSpy();
  const attempts: unknown[] = [];

  const starter = createSessionStarter({
    store,
    requestSignIn: (attempt) => {
      attempts.push(attempt);

      return Promise.resolve(result);
    },
  });

  return { attempts, started, starter };
}

describe('createSessionStarter', () => {
  it('starts the session and withholds the token from its caller', async () => {
    const { started, starter } = createStarter({ status: 'signed-in', accessToken: issuedToken });

    await expect(starter.signIn(credentials)).resolves.toStrictEqual({ status: 'signed-in' });
    expect(started).toStrictEqual([issuedToken]);
  });

  it('leaves the session untouched when the credentials are rejected', async () => {
    const { started, starter } = createStarter({ status: 'rejected' });

    await expect(starter.signIn(credentials)).resolves.toStrictEqual({ status: 'rejected' });
    expect(started).toStrictEqual([]);
  });

  it('leaves the session untouched when the attempt is rate limited', async () => {
    const { started, starter } = createStarter({ status: 'rate-limited' });

    await expect(starter.signIn(credentials)).resolves.toStrictEqual({ status: 'rate-limited' });
    expect(started).toStrictEqual([]);
  });

  it('leaves the session untouched when the attempt could not be judged', async () => {
    const { started, starter } = createStarter({ status: 'unavailable' });

    await expect(starter.signIn(credentials)).resolves.toStrictEqual({ status: 'unavailable' });
    expect(started).toStrictEqual([]);
  });

  it('passes the credentials through to the injected transport unchanged', async () => {
    const { attempts, starter } = createStarter({ status: 'rejected' });

    await starter.signIn(credentials);

    expect(attempts).toStrictEqual([credentials]);
  });

  it('propagates a transport that throws instead of swallowing it', async () => {
    const { started, store } = createStoreSpy();
    const starter = createSessionStarter({
      store,
      requestSignIn: () => Promise.reject(new Error('boom')),
    });

    await expect(starter.signIn(credentials)).rejects.toThrow('boom');
    expect(started).toStrictEqual([]);
  });

  it('authenticates the real session store and publishes once per distinct token', async () => {
    const store = createSessionStore();
    const notifications: SessionStatus[] = [];
    store.subscribe(() => {
      notifications.push(store.read().status);
    });
    const starter = createSessionStarter({
      store,
      requestSignIn: () => Promise.resolve({ status: 'signed-in', accessToken: issuedToken }),
    });

    await starter.signIn(credentials);
    await starter.signIn(credentials);

    expect(store.read().status).toBe('authenticated');
    expect(notifications).toStrictEqual(['authenticated']);
  });
});
