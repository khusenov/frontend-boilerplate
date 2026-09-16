import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SessionEnderProvider, SessionStarterProvider } from '@/entities/session';
import { HttpClientProvider, toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';
import { NotifierProvider } from '@/shared/notifications';
import type { Notifier } from '@/shared/notifications';

import { createAppRouter } from '../../router/create-app-router';

const adaPayload = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('This route test issues no writes.')));

const httpClient: HttpClient = {
  get: async (url, config) => {
    if (url !== '/users/u_1') {
      throw toHttpError(new Error(`expected a request to /users/u_1, received ${url}`));
    }

    const result = await config.schema['~standard'].validate(adaPayload);

    if (result.issues !== undefined) {
      throw toHttpError(new Error('the payload does not satisfy the request schema'));
    }

    return result.value;
  },
  post: notCalled,
  put: notCalled,
  patch: notCalled,
  delete: notCalled,
};

const noopNotifier: Notifier = () => undefined;

const sessionEnder = { signOut: () => Promise.resolve({ status: 'signed-out' } as const) };
const sessionStarter = { signIn: () => Promise.resolve({ status: 'rejected' } as const) };
const sessionResolver = { resolve: () => Promise.resolve('authenticated' as const) };

describe('the /users/$userId route', () => {
  it('loads the user named by the url and renders the profile', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createAppRouter({
      context: { httpClient, queryClient, sessionResolver },
      history: createMemoryHistory({ initialEntries: ['/users/u_1'] }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HttpClientProvider client={httpClient}>
          <SessionStarterProvider sessionStarter={sessionStarter}>
            <SessionEnderProvider sessionEnder={sessionEnder}>
              <NotifierProvider notifier={noopNotifier}>
                <RouterProvider router={router} />
              </NotifierProvider>
            </SessionEnderProvider>
          </SessionStarterProvider>
        </HttpClientProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' }),
    ).toBeInTheDocument();
  });

  it('returns to sign-in when the session is ended from the profile', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createAppRouter({
      context: { httpClient, queryClient, sessionResolver },
      history: createMemoryHistory({ initialEntries: ['/users/u_1'] }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HttpClientProvider client={httpClient}>
          <SessionStarterProvider sessionStarter={sessionStarter}>
            <SessionEnderProvider sessionEnder={sessionEnder}>
              <NotifierProvider notifier={noopNotifier}>
                <RouterProvider router={router} />
              </NotifierProvider>
            </SessionEnderProvider>
          </SessionStarterProvider>
        </HttpClientProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });
});
