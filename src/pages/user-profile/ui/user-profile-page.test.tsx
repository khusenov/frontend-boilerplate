import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toUserId } from '@/entities/user';
import { HttpClientProvider, toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { UserProfilePage } from './user-profile-page';

const adaPayload = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The profile page performs no writes.')));

function createClientStub(get: HttpClient['get']): HttpClient {
  return { get, post: notCalled, put: notCalled, patch: notCalled, delete: notCalled };
}

const resolvingClient = createClientStub(async (_url, config) => {
  const result = await config.schema['~standard'].validate(adaPayload);

  if (result.issues !== undefined) {
    throw toHttpError(new Error('the payload does not satisfy the request schema'));
  }

  return result.value;
});

const failingClient = createClientStub(() => Promise.reject(toHttpError(new Error('offline'))));

const pendingClient = createClientStub(() => new Promise<never>(() => undefined));

function renderPage(httpClient: HttpClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <UserProfilePage userId={toUserId('u_1')} />
      </HttpClientProvider>
    </QueryClientProvider>,
  );
}

describe('UserProfilePage', () => {
  it('announces that the profile is loading', () => {
    renderPage(pendingClient);

    expect(screen.getByRole('status')).toHaveTextContent('Loading profile');
  });

  it('renders the profile once the query resolves', async () => {
    renderPage(resolvingClient);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ada Lovelace');
  });

  it('raises an alert when the profile cannot be loaded', async () => {
    renderPage(failingClient);

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
