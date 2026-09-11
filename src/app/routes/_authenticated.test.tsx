import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionStarterProvider } from '@/entities/session';
import type { SessionStatus } from '@/entities/session';
import { HttpClientProvider, toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { createAppRouter } from '../router/create-app-router';

const adaPayload = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The guard tests issue no writes.')));

const sessionStarter = { signIn: () => Promise.resolve({ status: 'rejected' } as const) };

const PENDING_TIMEOUT_MILLISECONDS = 3000;

function renderGuardedRoute(resolve: () => Promise<SessionStatus>) {
  const requestedUrls: string[] = [];
  const httpClient: HttpClient = {
    get: async (url, config) => {
      requestedUrls.push(url);

      const result = await config.schema['~standard'].validate(adaPayload);

      if (result.issues !== undefined) {
        throw toHttpError(new Error(`the payload does not satisfy the schema for ${url}`));
      }

      return result.value;
    },
    post: notCalled,
    put: notCalled,
    patch: notCalled,
    delete: notCalled,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sessionResolver = { resolve: vi.fn(resolve) };
  const router = createAppRouter({
    context: { httpClient, queryClient, sessionResolver },
    history: createMemoryHistory({ initialEntries: ['/users/u_1'] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <SessionStarterProvider sessionStarter={sessionStarter}>
          <RouterProvider router={router} />
        </SessionStarterProvider>
      </HttpClientProvider>
    </QueryClientProvider>,
  );

  return { router, sessionResolver, requestedUrls };
}

describe('the authenticated route guard', () => {
  it('renders the guarded route for an authenticated session', async () => {
    const { router } = renderGuardedRoute(() => Promise.resolve('authenticated'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/users/u_1');
  });

  it('sends an anonymous visitor to the sign-in page', async () => {
    const { router } = renderGuardedRoute(() => Promise.resolve('anonymous'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends a visitor whose session cannot be resolved to the sign-in page', async () => {
    const { router } = renderGuardedRoute(() => Promise.resolve('unknown'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in');
    });
  });

  it('issues no request for a visitor it turns away', async () => {
    const { router, requestedUrls } = renderGuardedRoute(() => Promise.resolve('anonymous'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in');
    });
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(requestedUrls).toStrictEqual([]);
  });

  it('shows the resolving page while the verdict is pending', async () => {
    let settle!: (status: SessionStatus) => void;
    const pending = new Promise<SessionStatus>((resolve) => {
      settle = resolve;
    });

    renderGuardedRoute(() => pending);

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Checking your session…' },
        { timeout: PENDING_TIMEOUT_MILLISECONDS },
      ),
    ).toBeInTheDocument();

    settle('authenticated');

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Ada Lovelace' },
        { timeout: PENDING_TIMEOUT_MILLISECONDS },
      ),
    ).toBeInTheDocument();
  });

  it('asks the session port for a verdict', async () => {
    const { sessionResolver } = renderGuardedRoute(() => Promise.resolve('anonymous'));

    await waitFor(() => {
      expect(sessionResolver.resolve).toHaveBeenCalled();
    });
  });
});
