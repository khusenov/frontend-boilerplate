import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, Link, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { createAppRouter } from './create-app-router';

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The router tests perform no HTTP calls.')));

const httpClient: HttpClient = {
  get: notCalled,
  post: notCalled,
  put: notCalled,
  patch: notCalled,
  delete: notCalled,
};

function createRouterAt(initialPath: string) {
  const queryClient = new QueryClient();
  const router = createAppRouter({
    context: { httpClient, queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return { router, queryClient };
}

function renderRouterAt(initialPath: string) {
  const created = createRouterAt(initialPath);

  render(<RouterProvider router={created.router} />);

  return created;
}

describe('createAppRouter', () => {
  it('renders the home page at the root path', async () => {
    renderRouterAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'frontend-boilerplate' }),
    ).toBeInTheDocument();
  });

  it('renders the not-found page for an unmatched path', async () => {
    renderRouterAt('/does-not-exist');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('navigates back to the home page from the not-found page', async () => {
    const user = userEvent.setup();
    renderRouterAt('/does-not-exist');

    await user.click(await screen.findByRole('link', { name: 'Back to home' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'frontend-boilerplate' }),
    ).toBeInTheDocument();
  });

  it('stores the injected dependencies on the router context', () => {
    const { router, queryClient } = createRouterAt('/');

    expect(router.options.context.httpClient).toBe(httpClient);
    expect(router.options.context.queryClient).toBe(queryClient);
  });

  it('applies the routing policy the factory owns', () => {
    const { router } = createRouterAt('/');

    expect(router.options.defaultPreload).toBe('intent');
    expect(router.options.defaultPreloadStaleTime).toBe(0);
    expect(router.options.scrollRestoration).toBe(true);
  });

  it('rejects a link to a path outside the generated route tree', () => {
    // @ts-expect-error a URL that no route file declares must not type-check
    const brokenLink = <Link to="/definitely-not-a-route">broken</Link>;

    expect(brokenLink).toBeDefined();
  });
});
