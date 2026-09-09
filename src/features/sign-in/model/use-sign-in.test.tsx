import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SessionStarterProvider } from '@/entities/session';
import type { SessionStarter } from '@/entities/session';

import { useSignIn } from './use-sign-in';

const ada = { email: 'ada@example.test', password: 'correct horse' };

function renderSignIn(sessionStarter: SessionStarter) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSignedIn = vi.fn();

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionStarterProvider sessionStarter={sessionStarter}>{children}</SessionStarterProvider>
      </QueryClientProvider>
    );
  }

  return {
    onSignedIn,
    queryClient,
    ...renderHook(() => useSignIn({ onSignedIn }), { wrapper: Wrapper }),
  };
}

describe('useSignIn', () => {
  it('reports an idle status before anything is submitted', () => {
    const { result } = renderSignIn({ signIn: () => Promise.resolve({ status: 'signed-in' }) });

    expect(result.current.status).toBe('idle');
  });

  it('reports a signed-in status and notifies the caller once', async () => {
    const { onSignedIn, result } = renderSignIn({
      signIn: () => Promise.resolve({ status: 'signed-in' }),
    });

    await act(async () => {
      await result.current.submit(ada);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('signed-in');
    });
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it('reports a rejected status without notifying the caller', async () => {
    const { onSignedIn, result } = renderSignIn({
      signIn: () => Promise.resolve({ status: 'rejected' }),
    });

    await act(async () => {
      await result.current.submit(ada);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('rejected');
    });
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('reports a rate-limited status', async () => {
    const { result } = renderSignIn({ signIn: () => Promise.resolve({ status: 'rate-limited' }) });

    await act(async () => {
      await result.current.submit(ada);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('rate-limited');
    });
  });

  it('reports an unavailable status', async () => {
    const { result } = renderSignIn({ signIn: () => Promise.resolve({ status: 'unavailable' }) });

    await act(async () => {
      await result.current.submit(ada);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('reports an unavailable status without rejecting when the starter throws', async () => {
    const { result } = renderSignIn({
      signIn: () => Promise.reject(new Error('the port is broken')),
    });

    await act(async () => {
      await expect(result.current.submit(ada)).resolves.toBeUndefined();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('reports a submitting status while the request is in flight', async () => {
    const { result } = renderSignIn({ signIn: () => new Promise(() => undefined) });

    act(() => {
      void result.current.submit(ada);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('submitting');
    });
  });

  it('returns a settled failure to idle when the outcome is dismissed', async () => {
    const { result } = renderSignIn({ signIn: () => Promise.resolve({ status: 'rejected' }) });

    await act(async () => {
      await result.current.submit(ada);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('rejected');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('leaves an idle status alone when the outcome is dismissed', async () => {
    const { result } = renderSignIn({ signIn: () => Promise.resolve({ status: 'rejected' }) });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('drops the credential from the mutation cache when the form unmounts', async () => {
    const { queryClient, result, unmount } = renderSignIn({
      signIn: () => Promise.resolve({ status: 'signed-in' }),
    });

    await act(async () => {
      await result.current.submit(ada);
    });

    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

    unmount();

    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    });
  });

  it('leaves an in flight request alone when the outcome is dismissed', async () => {
    const { result } = renderSignIn({ signIn: () => new Promise(() => undefined) });

    act(() => {
      void result.current.submit(ada);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('submitting');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('submitting');
    });
  });
});
