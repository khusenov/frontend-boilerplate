import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { toUserId } from '@/entities/user';
import { HttpClientProvider, toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { useUpdateUserName } from './use-update-user-name';

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('This hook issues only a patch.')));

function createClientStub(patch: HttpClient['patch']): HttpClient {
  return { get: notCalled, post: notCalled, put: notCalled, patch, delete: notCalled };
}

const resolvingClient = createClientStub(async (_url, config) => {
  const result = await config.schema['~standard'].validate(null);

  if (result.issues !== undefined) {
    throw toHttpError(new Error('the response does not satisfy the request schema'));
  }

  return result.value;
});

const failingClient = createClientStub(() => Promise.reject(toHttpError(new Error('offline'))));

function renderUpdateUserName(httpClient: HttpClient) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <HttpClientProvider client={httpClient}>{children}</HttpClientProvider>
      </QueryClientProvider>
    );
  }

  return renderHook(() => useUpdateUserName(toUserId('u_1')), { wrapper: Wrapper });
}

const ada = { firstName: 'Ada', lastName: 'King' };

describe('useUpdateUserName', () => {
  it('reports an idle status before anything is submitted', () => {
    const { result } = renderUpdateUserName(resolvingClient);

    expect(result.current.status).toBe('idle');
  });

  it('reports a saved status once the request resolves', async () => {
    const { result } = renderUpdateUserName(resolvingClient);

    await act(async () => {
      await result.current.submit(ada);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('saved');
    });
  });

  it('reports a failed status without rejecting when the request fails', async () => {
    const { result } = renderUpdateUserName(failingClient);

    await act(async () => {
      await expect(result.current.submit(ada)).resolves.toBeUndefined();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
  });

  it('returns a settled success to idle when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(resolvingClient);

    await act(async () => {
      await result.current.submit(ada);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('saved');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('returns a settled failure to idle when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(failingClient);

    await act(async () => {
      await result.current.submit(ada);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('leaves an idle status alone when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(resolvingClient);

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('leaves an in flight request alone when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(
      createClientStub(() => new Promise<never>(() => undefined)),
    );

    act(() => {
      void result.current.submit(ada);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('saving');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('saving');
    });
  });
});
