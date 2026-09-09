import { hashKey, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SessionStarter, SessionStatus } from '@/entities/session';
import { useSessionStarter } from '@/entities/session';
import type { HttpClient } from '@/shared/api';
import { toHttpError, useHttpClient } from '@/shared/api';

import { AppProviders } from './app-providers';
import { createAuthenticatedTransport } from './create-authenticated-transport';
import type { AuthenticatedTransport } from './create-authenticated-transport';

vi.mock(import('./create-authenticated-transport'), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, createAuthenticatedTransport: vi.fn(actual.createAuthenticatedTransport) };
});

const PROBE_KEY = ['probe'];

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The provider tests perform no HTTP calls.')));

const inertHttpClient: HttpClient = {
  get: notCalled,
  post: notCalled,
  put: notCalled,
  patch: notCalled,
  delete: notCalled,
};

function createControllableTransport(initialStatus: SessionStatus) {
  let status = initialStatus;
  const listeners = new Set<() => void>();

  const transport: AuthenticatedTransport = {
    httpClient: inertHttpClient,
    sessionObserver: {
      status: () => status,
      subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => {
          listeners.delete(listener);
        };
      },
    },
    sessionStarter: { signIn: () => Promise.resolve({ status: 'unavailable' }) },
  };

  function moveTo(next: SessionStatus) {
    status = next;

    for (const listener of [...listeners]) {
      listener();
    }
  }

  return { transport, moveTo };
}

function createQueryErrorHandlersFake() {
  return { onQueryError: vi.fn(), onMutationError: vi.fn() };
}

describe('AppProviders', () => {
  it('renders its children', () => {
    render(
      <AppProviders apiBaseUrl="/api" queryErrorHandlers={createQueryErrorHandlersFake()}>
        <p>child content</p>
      </AppProviders>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('provides the configured query client and a usable http client', () => {
    const captured: { httpClient: HttpClient | null; staleTime: unknown } = {
      httpClient: null,
      staleTime: null,
    };

    function ClientProbe() {
      captured.httpClient = useHttpClient();
      captured.staleTime = useQueryClient().getDefaultOptions().queries?.staleTime;

      return null;
    }

    render(
      <AppProviders apiBaseUrl="/api" queryErrorHandlers={createQueryErrorHandlersFake()}>
        <ClientProbe />
      </AppProviders>,
    );

    expect(typeof captured.httpClient?.get).toBe('function');
    expect(captured.staleTime).toBe(30_000);
  });

  it('keeps one http client instance across re-renders', () => {
    const seen: HttpClient[] = [];

    function IdentityProbe() {
      seen.push(useHttpClient());

      return null;
    }

    const renderTree = () => (
      <AppProviders apiBaseUrl="/api" queryErrorHandlers={createQueryErrorHandlersFake()}>
        <IdentityProbe />
      </AppProviders>
    );
    const { rerender } = render(renderTree());
    rerender(renderTree());

    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(1);
  });

  it('clears the query cache when the session ends', () => {
    const { transport, moveTo } = createControllableTransport('authenticated');
    vi.mocked(createAuthenticatedTransport).mockReturnValueOnce(transport);
    const captured: { cache: QueryClient | null } = { cache: null };

    function CacheProbe() {
      captured.cache = useQueryClient();

      return null;
    }

    render(
      <AppProviders apiBaseUrl="/api" queryErrorHandlers={createQueryErrorHandlersFake()}>
        <CacheProbe />
      </AppProviders>,
    );
    captured.cache?.setQueryData(PROBE_KEY, 'value');

    expect(captured.cache?.getQueryData(PROBE_KEY)).toBe('value');

    moveTo('anonymous');

    expect(captured.cache?.getQueryData(PROBE_KEY)).toBeUndefined();
  });

  it('provides the transport session starter to its children', () => {
    const { transport } = createControllableTransport('unknown');
    vi.mocked(createAuthenticatedTransport).mockReturnValueOnce(transport);
    const captured: { starter: SessionStarter | null } = { starter: null };

    function StarterProbe() {
      captured.starter = useSessionStarter();

      return null;
    }

    render(
      <AppProviders apiBaseUrl="/api" queryErrorHandlers={createQueryErrorHandlersFake()}>
        <StarterProbe />
      </AppProviders>,
    );

    expect(captured.starter).toBe(transport.sessionStarter);
  });

  it('reports a query failure through the injected handlers', async () => {
    const queryErrorHandlers = createQueryErrorHandlersFake();
    const error = new Error('query failed');

    function FailingQueryProbe() {
      const queryClient = useQueryClient();

      useEffect(() => {
        void queryClient
          .fetchQuery({ queryKey: ['boom'], queryFn: () => Promise.reject(error), retry: false })
          .catch(() => undefined);
      }, [queryClient]);

      return null;
    }

    render(
      <AppProviders apiBaseUrl="/api" queryErrorHandlers={queryErrorHandlers}>
        <FailingQueryProbe />
      </AppProviders>,
    );

    await waitFor(() => {
      expect(queryErrorHandlers.onQueryError).toHaveBeenCalledWith(error, hashKey(['boom']));
    });
  });
});
