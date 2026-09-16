import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SessionEnderProvider, SessionStarterProvider } from '@/entities/session';
import { HttpClientProvider, toHttpError } from '@/shared/api';
import { NotifierProvider } from '@/shared/notifications';
import type { Notifier } from '@/shared/notifications';
import { createHttpClientStub, parseStubResponse } from '@/shared/testing';

import { createAppRouter } from '../../router/create-app-router';

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';
const ADA_RESOURCE_PATH = `/users/${ADA_ID}`;
const ADA_PROFILE_URL = `/users/${ADA_ID}`;

const adaPayload = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-01-05T12:00:00.000Z',
};

const httpClient = createHttpClientStub({
  get: async (url, config) => {
    if (url !== ADA_RESOURCE_PATH) {
      throw toHttpError(new Error(`expected a request to ${ADA_RESOURCE_PATH}, received ${url}`));
    }

    return parseStubResponse(config.schema, adaPayload);
  },
});

const noopNotifier: Notifier = () => undefined;

const sessionEnder = { signOut: () => Promise.resolve({ status: 'signed-out' } as const) };
const sessionStarter = { signIn: () => Promise.resolve({ status: 'rejected' } as const) };
const sessionResolver = { resolve: () => Promise.resolve('authenticated' as const) };

describe('the /users/$userId route', () => {
  it('loads the user named by the url and renders the profile', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createAppRouter({
      context: { httpClient, queryClient, sessionResolver },
      history: createMemoryHistory({ initialEntries: [ADA_PROFILE_URL] }),
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
      history: createMemoryHistory({ initialEntries: [ADA_PROFILE_URL] }),
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
