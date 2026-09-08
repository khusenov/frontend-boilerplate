import { hashKey, MutationObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HttpErrorKind } from './http-error';
import { HttpError } from './http-error';
import { createQueryClient } from './query-client';

function createHttpError(kind: HttpErrorKind, status: number | null = null): HttpError {
  const details = { kind, status, method: 'GET', url: '/things', payload: null, issues: [] };

  return new HttpError('failed', details, null);
}

function getQueryRetry() {
  const { queries } = createQueryClient().getDefaultOptions();
  const retry = queries?.retry;

  if (typeof retry !== 'function') {
    throw new TypeError('Expected the default query retry to be a predicate');
  }

  return retry;
}

describe('createQueryClient', () => {
  it('shares one stale time and garbage collection time across queries', () => {
    const { queries } = createQueryClient().getDefaultOptions();

    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.gcTime).toBe(300_000);
  });

  it('does not retry mutations, which are not assumed idempotent', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('lets a caller override a default without losing the others', () => {
    const { queries } = createQueryClient({
      defaultOptions: { queries: { staleTime: 0 } },
    }).getDefaultOptions();

    expect(queries?.staleTime).toBe(0);
    expect(queries?.gcTime).toBe(300_000);
  });

  it('stops retrying once the attempt limit is reached', () => {
    const retry = getQueryRetry();

    expect(retry(1, createHttpError('network'))).toBe(true);
    expect(retry(2, createHttpError('network'))).toBe(false);
  });
});

describe('the default query retry policy', () => {
  it('retries transport failures that may succeed on a second attempt', () => {
    const retry = getQueryRetry();

    expect(retry(0, createHttpError('network'))).toBe(true);
    expect(retry(0, createHttpError('timeout'))).toBe(true);
    expect(retry(0, createHttpError('server'))).toBe(true);
  });

  it('never retries a request the server deliberately rejected', () => {
    expect(getQueryRetry()(0, createHttpError('client', 422))).toBe(false);
  });

  it('retries a throttled request even though it is a client error', () => {
    expect(getQueryRetry()(0, createHttpError('client', 429))).toBe(true);
  });

  it('never retries a cancellation', () => {
    expect(getQueryRetry()(0, createHttpError('canceled'))).toBe(false);
  });

  it('never retries an error that did not come from the transport', () => {
    expect(getQueryRetry()(0, new Error('mapper failed'))).toBe(false);
  });
});

describe('createQueryClient failure callbacks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a failing query with its serialised key', async () => {
    const onQueryError = vi.fn();
    const queryClient = createQueryClient({ onQueryError });
    const error = new Error('query failed');

    await queryClient
      .fetchQuery({ queryKey: ['users', '1'], queryFn: () => Promise.reject(error), retry: false })
      .catch(() => undefined);

    expect(onQueryError).toHaveBeenCalledWith(error, hashKey(['users', '1']));
  });

  it('reports a failing mutation with its serialised key', async () => {
    const onMutationError = vi.fn();
    const queryClient = createQueryClient({ onMutationError });
    const error = new Error('mutation failed');
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['users', 'update-name'],
      mutationFn: () => Promise.reject(error),
    });

    await observer.mutate(undefined).catch(() => undefined);

    expect(onMutationError).toHaveBeenCalledWith(error, hashKey(['users', 'update-name']));
  });

  it('reports an empty key for a mutation declared without one', async () => {
    const onMutationError = vi.fn();
    const queryClient = createQueryClient({ onMutationError });
    const error = new Error('mutation failed');
    const observer = new MutationObserver(queryClient, {
      mutationFn: () => Promise.reject(error),
    });

    await observer.mutate(undefined).catch(() => undefined);

    expect(onMutationError).toHaveBeenCalledWith(error, hashKey([]));
  });

  it('stays silent when no failure callbacks are supplied', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queryClient = createQueryClient();
    const error = new Error('query failed');
    const observer = new MutationObserver(queryClient, {
      mutationFn: () => Promise.reject(error),
    });

    await queryClient
      .fetchQuery({ queryKey: ['users', '2'], queryFn: () => Promise.reject(error), retry: false })
      .catch(() => undefined);
    await observer.mutate(undefined).catch(() => undefined);

    expect(consoleError).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().find({ queryKey: ['users', '2'] })?.state.status).toBe(
      'error',
    );
  });

  it('honours a custom queryKeyHashFn for queries while mutations keep TanStack hashing', async () => {
    const onQueryError = vi.fn();
    const onMutationError = vi.fn();
    const queryClient = createQueryClient({
      onQueryError,
      onMutationError,
      defaultOptions: { queries: { queryKeyHashFn: () => 'custom-hash' } },
    });
    const error = new Error('failed');
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['users', 'update-name'],
      mutationFn: () => Promise.reject(error),
    });

    await queryClient
      .fetchQuery({ queryKey: ['users', '1'], queryFn: () => Promise.reject(error), retry: false })
      .catch(() => undefined);
    await observer.mutate(undefined).catch(() => undefined);

    expect(onQueryError).toHaveBeenCalledWith(error, 'custom-hash');
    expect(onMutationError).toHaveBeenCalledWith(error, hashKey(['users', 'update-name']));
  });
});
