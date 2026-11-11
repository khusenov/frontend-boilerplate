import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, Link, rootRouteId, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionResolver } from '@/entities/session';
import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { createAppRouter } from './create-app-router';
import { ROUTER_FALLBACK_DEFAULTS } from './router-fallback-defaults';

const GUARDED_PATH = '/users/0198f0a2-7b1c-7d3e-8f00-123456789abc';
const ROUTE_ERROR_HEADING = { level: 1, name: 'This page could not be displayed' } as const;

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The router tests perform no HTTP calls.')));

const httpClient: HttpClient = {
  get: notCalled,
  post: notCalled,
  put: notCalled,
  patch: notCalled,
  delete: notCalled,
};

const sessionResolver: SessionResolver = {
  resolve: () => Promise.resolve('anonymous' as const),
};

const contractBreakingSessionResolver: SessionResolver = {
  resolve: () => Promise.reject(new Error('The session resolver rejected.')),
};

function silenceCaughtErrorLogs() {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

function createRouterAt(initialPath: string, resolver: SessionResolver = sessionResolver) {
  const queryClient = new QueryClient();
  const router = createAppRouter({
    context: { httpClient, queryClient, sessionResolver: resolver },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return { router, queryClient };
}

function renderRouterAt(initialPath: string, resolver: SessionResolver = sessionResolver) {
  const created = createRouterAt(initialPath, resolver);

  render(<RouterProvider router={created.router} />);

  return created;
}

describe('createAppRouter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('contains a route that fails to load inside the app shell', async () => {
    silenceCaughtErrorLogs();
    renderRouterAt(GUARDED_PATH, contractBreakingSessionResolver);

    expect(await screen.findByRole('heading', ROUTE_ERROR_HEADING)).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('frontend-boilerplate');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('navigates back to the home page from the route error screen', async () => {
    silenceCaughtErrorLogs();
    const user = userEvent.setup();
    renderRouterAt(GUARDED_PATH, contractBreakingSessionResolver);

    await user.click(await screen.findByRole('link', { name: 'Back to home' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'frontend-boilerplate' }),
    ).toBeInTheDocument();
  });

  it('stores the injected dependencies on the router context', () => {
    const { router, queryClient } = createRouterAt('/');

    expect(router.options.context.httpClient).toBe(httpClient);
    expect(router.options.context.queryClient).toBe(queryClient);
    expect(router.options.context.sessionResolver).toBe(sessionResolver);
  });

  it('applies the routing policy the factory owns', () => {
    const { router } = createRouterAt('/');

    expect(router.options).toMatchObject(ROUTER_FALLBACK_DEFAULTS);
    expect(router.options.defaultPreload).toBe('intent');
    expect(router.options.defaultPreloadStaleTime).toBe(0);
    expect(router.options.scrollRestoration).toBe(true);
    expect(router.routesById[rootRouteId].options.errorComponent).toBe(false);
  });

  it('rejects a link to a path outside the generated route tree', () => {
    // @ts-expect-error a URL that no route file declares must not type-check
    const brokenLink = <Link to="/definitely-not-a-route">broken</Link>;

    expect(brokenLink).toBeDefined();
  });
});
