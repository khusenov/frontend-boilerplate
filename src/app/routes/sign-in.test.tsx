import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SessionStarterProvider } from '@/entities/session';
import type { SessionStarter } from '@/entities/session';
import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { createAppRouter } from '../router/create-app-router';

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The sign-in route performs no HTTP calls.')));

const httpClient: HttpClient = {
  get: notCalled,
  post: notCalled,
  put: notCalled,
  patch: notCalled,
  delete: notCalled,
};

function renderSignInRoute(sessionStarter: SessionStarter) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const router = createAppRouter({
    context: { httpClient, queryClient },
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <SessionStarterProvider sessionStarter={sessionStarter}>
        <RouterProvider router={router} />
      </SessionStarterProvider>
    </QueryClientProvider>,
  );

  return { router, user: userEvent.setup() };
}

describe('the sign-in route', () => {
  it('renders the sign-in page at /sign-in', async () => {
    renderSignInRoute({ signIn: () => Promise.resolve({ status: 'rejected' }) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('leaves the user on the page when the credentials are rejected', async () => {
    const { router, user } = renderSignInRoute({
      signIn: () => Promise.resolve({ status: 'rejected' }),
    });

    await screen.findByRole('form', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email'), 'ada@example.test');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('navigates home when sign-in succeeds', async () => {
    const { router, user } = renderSignInRoute({
      signIn: () => Promise.resolve({ status: 'signed-in' }),
    });

    await screen.findByRole('form', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email'), 'ada@example.test');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});
