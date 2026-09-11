import { describe, expect, it, vi } from 'vitest';

import { createSessionResolver } from './session-resolver';

describe('createSessionResolver', () => {
  it('reports an authenticated session', async () => {
    const settler = { settle: vi.fn(() => Promise.resolve('authenticated' as const)) };

    const resolver = createSessionResolver({ settler });

    await expect(resolver.resolve()).resolves.toBe('authenticated');
    expect(settler.settle).toHaveBeenCalledOnce();
  });

  it('reports an anonymous session', async () => {
    const settler = { settle: vi.fn(() => Promise.resolve('anonymous' as const)) };

    const resolver = createSessionResolver({ settler });

    await expect(resolver.resolve()).resolves.toBe('anonymous');
  });

  it('reports an unresolved session as unknown', async () => {
    const settler = { settle: vi.fn(() => Promise.resolve('unknown' as const)) };

    const resolver = createSessionResolver({ settler });

    await expect(resolver.resolve()).resolves.toBe('unknown');
  });

  it('denies the session rather than rejecting when the settler throws', async () => {
    const settler = { settle: vi.fn(() => Promise.reject(new Error('the lock timed out'))) };

    const resolver = createSessionResolver({ settler });

    await expect(resolver.resolve()).resolves.toBe('unknown');
  });

  it('asks the settler again on every call', async () => {
    const settler = { settle: vi.fn(() => Promise.resolve('unknown' as const)) };

    const resolver = createSessionResolver({ settler });

    await resolver.resolve();
    await resolver.resolve();

    expect(settler.settle).toHaveBeenCalledTimes(2);
  });
});
