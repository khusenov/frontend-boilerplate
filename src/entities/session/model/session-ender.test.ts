import { describe, expect, it } from 'vitest';

import { createSessionEnder } from './session-ender';
import type { SessionEndTarget } from './session-ender';
import type { SignOutOutcome } from './sign-out-outcome';

function createStoreSpy() {
  const endings: number[] = [];

  const store: SessionEndTarget = {
    end: () => {
      endings.push(endings.length + 1);
    },
  };

  return { endings, store };
}

function createEnder(outcome: SignOutOutcome) {
  const { endings, store } = createStoreSpy();
  const ender = createSessionEnder({ store, requestSignOut: () => Promise.resolve(outcome) });

  return { endings, ender };
}

describe('createSessionEnder', () => {
  it('ends the local session when the server revokes it', async () => {
    const { endings, ender } = createEnder({ status: 'signed-out' });

    await expect(ender.signOut()).resolves.toStrictEqual({ status: 'signed-out' });
    expect(endings).toHaveLength(1);
  });

  it('ends the local session when the server could not be reached', async () => {
    const { endings, ender } = createEnder({ status: 'unavailable' });

    await expect(ender.signOut()).resolves.toStrictEqual({ status: 'unavailable' });
    expect(endings).toHaveLength(1);
  });

  it('ends the local session and rethrows when the transport throws', async () => {
    const { endings, store } = createStoreSpy();
    const ender = createSessionEnder({
      store,
      requestSignOut: () => Promise.reject(new Error('the port is broken')),
    });

    await expect(ender.signOut()).rejects.toThrow('the port is broken');
    expect(endings).toHaveLength(1);
  });

  it('ends the local session exactly once per sign-out', async () => {
    const { endings, ender } = createEnder({ status: 'signed-out' });

    await ender.signOut();
    await ender.signOut();

    expect(endings).toStrictEqual([1, 2]);
  });
});
