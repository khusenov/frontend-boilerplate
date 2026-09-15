import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SessionEnderProvider } from '@/entities/session';
import type { SessionEnder } from '@/entities/session';

import { useSignOut } from './use-sign-out';

function renderSignOut(sessionEnder: SessionEnder) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSignedOut = vi.fn();

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionEnderProvider sessionEnder={sessionEnder}>{children}</SessionEnderProvider>
      </QueryClientProvider>
    );
  }

  return {
    onSignedOut,
    ...renderHook(() => useSignOut({ onSignedOut }), { wrapper: Wrapper }),
  };
}

describe('useSignOut', () => {
  it('reports an idle button before anything is submitted', () => {
    const { onSignedOut, result } = renderSignOut({
      signOut: () => Promise.resolve({ status: 'signed-out' }),
    });

    expect(result.current.isSigningOut).toBe(false);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('notifies the caller once when the server revokes the session', async () => {
    const { onSignedOut, result } = renderSignOut({
      signOut: () => Promise.resolve({ status: 'signed-out' }),
    });

    await act(async () => {
      await result.current.signOut();
    });

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
  });

  it('notifies the caller once when the revocation could not be delivered', async () => {
    const { onSignedOut, result } = renderSignOut({
      signOut: () => Promise.resolve({ status: 'unavailable' }),
    });

    await act(async () => {
      await result.current.signOut();
    });

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
  });

  it('notifies the caller once and resolves when the ender rejects', async () => {
    const { onSignedOut, result } = renderSignOut({
      signOut: () => Promise.reject(new Error('the port is broken')),
    });

    await act(async () => {
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
  });

  it('reports a pending button while the request is in flight', async () => {
    const { result } = renderSignOut({ signOut: () => new Promise(() => undefined) });

    act(() => {
      void result.current.signOut();
    });

    await waitFor(() => {
      expect(result.current.isSigningOut).toBe(true);
    });
  });
});
