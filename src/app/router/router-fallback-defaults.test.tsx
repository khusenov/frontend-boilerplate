import { QueryClientProvider, queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type { ErrorRouteComponent, RouteComponent } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoutePendingPage } from '@/pages/route-pending';
import { createTestQueryClient } from '@/shared/testing';
import { ErrorBoundary } from '@/shared/ui/error-boundary';

import { RouteErrorFallback } from './route-error-fallback';
import { ROUTER_FALLBACK_DEFAULTS } from './router-fallback-defaults';

type TestPath =
  | '/loaded'
  | '/broken'
  | '/crashing'
  | '/greeting'
  | '/missing'
  | '/gone'
  | '/section/broken'
  | '/section/loaded'
  | '/section/missing'
  | '/section/gone';

interface RenderRouterOptions {
  readonly errorScreen?: ErrorRouteComponent;
  readonly rootLayout?: RouteComponent;
}

const ROUTE_ERROR_HEADING = { level: 1, name: 'This page could not be displayed' } as const;
const ROUTE_ERROR_DESCRIPTION =
  'An unexpected error interrupted this page. Try again, or go back to the home page.';
const RETRY_LABEL = 'Try again';
const PENDING_TEXT = 'Loading…';
const PAGE_LOADED_TEXT = 'Page loaded';
const SECTION_LAYOUT_TEXT = 'Section layout';
const GREETING_TEXT = 'Hello again';
const ROOT_NOT_FOUND_TEXT = 'Nothing here';
const APP_CRASH_TEXT = 'The app crash screen took over';
const CRASHED_SCREEN_MESSAGE = 'The error screen crashed.';
const CRASHED_LAYOUT_MESSAGE = 'The root layout crashed.';
const LEAKED_SECRET = 'leaked';
const LEAKED_DETAIL = `https://api.internal/v1/users?token=${LEAKED_SECRET}`;
const SECTION_LOAD_MILLISECONDS = 50;
const ROUTER_SETTLE_MILLISECONDS = 200;

const loadPage = vi.fn<() => Promise<void>>();
const fetchGreeting = vi.fn<() => Promise<string>>();
const recordRouteCatch = vi.fn();
const recordAppCrash = vi.fn();

const greetingQuery = queryOptions({
  queryKey: ['greeting'],
  queryFn: () => fetchGreeting(),
});

function loadNothing() {
  return Promise.resolve();
}

function loadSectionSlowly() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, SECTION_LOAD_MILLISECONDS);
  });
}

function throwNotFound() {
  notFound({ throw: true });
}

function waitForRouterToSettle() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ROUTER_SETTLE_MILLISECONDS);
  });
}

function createHeldLoad() {
  let release!: () => void;
  const load = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { load, release };
}

function LoadedPage() {
  return <p>{PAGE_LOADED_TEXT}</p>;
}

function BrokenPage(): never {
  throw new Error(LEAKED_DETAIL);
}

function GreetingPage() {
  const { data } = useSuspenseQuery(greetingQuery);

  return <p>{data}</p>;
}

function MissingPage() {
  notFound({ throw: true });

  return null;
}

function SectionLayout() {
  return (
    <>
      <p>{SECTION_LAYOUT_TEXT}</p>
      <Outlet />
    </>
  );
}

function RootNotFound() {
  return <p>{ROOT_NOT_FOUND_TEXT}</p>;
}

function AppCrashStandIn() {
  return <p>{APP_CRASH_TEXT}</p>;
}

function CrashingErrorScreen(): never {
  throw new Error(CRASHED_SCREEN_MESSAGE);
}

function CrashingRootLayout(): never {
  throw new Error(CRASHED_LAYOUT_MESSAGE);
}

function createTestRouteTree(rootLayout: RouteComponent) {
  const rootRoute = createRootRoute({
    component: rootLayout,
    errorComponent: false,
    notFoundComponent: RootNotFound,
  });
  const sectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/section',
    loader: loadSectionSlowly,
    component: SectionLayout,
  });

  return rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/loaded',
      loader: () => loadPage(),
      component: LoadedPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      loader: loadNothing,
      component: BrokenPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/crashing',
      component: BrokenPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/greeting',
      component: GreetingPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/missing',
      component: MissingPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/gone',
      loader: throwNotFound,
      component: LoadedPage,
    }),
    sectionRoute.addChildren([
      createRoute({
        getParentRoute: () => sectionRoute,
        path: '/broken',
        loader: loadNothing,
        component: BrokenPage,
      }),
      createRoute({
        getParentRoute: () => sectionRoute,
        path: '/loaded',
        loader: () => loadPage(),
        component: LoadedPage,
      }),
      createRoute({
        getParentRoute: () => sectionRoute,
        path: '/missing',
        component: MissingPage,
      }),
      createRoute({
        getParentRoute: () => sectionRoute,
        path: '/gone',
        beforeLoad: throwNotFound,
        component: LoadedPage,
      }),
    ]),
  ]);
}

function renderRouterAt(
  initialPath: TestPath,
  {
    errorScreen = ROUTER_FALLBACK_DEFAULTS.defaultErrorComponent,
    rootLayout = Outlet,
  }: RenderRouterOptions = {},
) {
  const router = createRouter({
    routeTree: createTestRouteTree(rootLayout),
    ...ROUTER_FALLBACK_DEFAULTS,
    defaultErrorComponent: errorScreen,
    defaultOnCatch: recordRouteCatch,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <ErrorBoundary FallbackComponent={AppCrashStandIn} onError={recordAppCrash}>
      <QueryClientProvider client={createTestQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>,
  );
}

describe('ROUTER_FALLBACK_DEFAULTS', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadPage.mockReset();
    fetchGreeting.mockReset();
    recordRouteCatch.mockReset();
    recordAppCrash.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pins the fallback policy', () => {
    expect(ROUTER_FALLBACK_DEFAULTS).toEqual({
      defaultPendingMs: 300,
      defaultPendingMinMs: 300,
      defaultPendingComponent: RoutePendingPage,
      defaultErrorComponent: RouteErrorFallback,
      disableGlobalCatchBoundary: true,
    });
  });

  it('replaces a route whose loader failed with the translated error screen', async () => {
    loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
    renderRouterAt('/loaded');

    expect(await screen.findByRole('heading', ROUTE_ERROR_HEADING)).toBeInTheDocument();
    expect(screen.getByText(ROUTE_ERROR_DESCRIPTION)).toBeInTheDocument();
  });

  it('moves focus to the heading so assistive technology reaches the failure', async () => {
    loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
    renderRouterAt('/loaded');

    const heading = await screen.findByRole('heading', ROUTE_ERROR_HEADING);

    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });

  it('never renders the thrown message', async () => {
    loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
    renderRouterAt('/loaded');

    await screen.findByRole('heading', ROUTE_ERROR_HEADING);

    expect(document.body).not.toHaveTextContent(LEAKED_SECRET);
  });

  it('links back to the home page', async () => {
    loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
    renderRouterAt('/loaded');

    expect(await screen.findByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('shows the pending screen when a navigation outlasts the pending delay', async () => {
    const { load, release } = createHeldLoad();
    loadPage.mockReturnValueOnce(load);
    renderRouterAt('/loaded');

    expect(await screen.findByRole('status')).toHaveTextContent(PENDING_TEXT);

    release();

    expect(await screen.findByText(PAGE_LOADED_TEXT)).toBeInTheDocument();
  });

  it('shows the pending screen during a retry and catches the failure once', async () => {
    const user = userEvent.setup();
    const { load, release } = createHeldLoad();
    loadPage.mockRejectedValueOnce(new Error(LEAKED_DETAIL)).mockReturnValueOnce(load);
    renderRouterAt('/loaded');

    await user.click(await screen.findByRole('button', { name: RETRY_LABEL }));

    expect(await screen.findByRole('status')).toHaveTextContent(PENDING_TEXT);
    expect(screen.queryByRole('heading', ROUTE_ERROR_HEADING)).not.toBeInTheDocument();

    release();

    expect(await screen.findByText(PAGE_LOADED_TEXT)).toBeInTheDocument();
    expect(recordRouteCatch).toHaveBeenCalledOnce();
  });

  it('announces the failure again when the retried load fails too', async () => {
    const user = userEvent.setup();
    loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
    renderRouterAt('/loaded');

    await user.click(await screen.findByRole('button', { name: RETRY_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole('heading', ROUTE_ERROR_HEADING)).toHaveFocus();
    });
    await waitForRouterToSettle();
    expect(recordRouteCatch).toHaveBeenCalledTimes(2);
  });

  it('retries a route whose component keeps failing with one catch per click', async () => {
    const user = userEvent.setup();
    renderRouterAt('/broken');

    await user.click(await screen.findByRole('button', { name: RETRY_LABEL }));

    expect(await screen.findByRole('status')).toHaveTextContent(PENDING_TEXT);
    await waitFor(() => {
      expect(screen.getByRole('heading', ROUTE_ERROR_HEADING)).toHaveFocus();
    });
    await waitForRouterToSettle();
    expect(recordRouteCatch).toHaveBeenCalledTimes(2);
  });

  it('re-renders a failed route with nothing to load at once on retry', async () => {
    const user = userEvent.setup();
    renderRouterAt('/crashing');

    await user.click(await screen.findByRole('button', { name: RETRY_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole('heading', ROUTE_ERROR_HEADING)).toHaveFocus();
    });
    await waitForRouterToSettle();
    expect(recordRouteCatch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['/section/broken', '/section/loaded'] as const)(
    'retries a failed %s once per click while its layout stays on screen',
    async (path) => {
      const user = userEvent.setup();
      loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
      renderRouterAt(path);

      await user.click(await screen.findByRole('button', { name: RETRY_LABEL }));

      expect(await screen.findByRole('status')).toHaveTextContent(PENDING_TEXT);
      expect(screen.getByText(SECTION_LAYOUT_TEXT)).toBeVisible();
      await waitFor(() => {
        expect(screen.getByRole('heading', ROUTE_ERROR_HEADING)).toHaveFocus();
      });
      await waitForRouterToSettle();
      expect(recordRouteCatch).toHaveBeenCalledTimes(2);
    },
  );

  it('refetches a suspense query that failed when the visitor retries', async () => {
    const user = userEvent.setup();
    fetchGreeting.mockRejectedValueOnce(new Error(LEAKED_DETAIL)).mockResolvedValue(GREETING_TEXT);
    renderRouterAt('/greeting');

    await user.click(await screen.findByRole('button', { name: RETRY_LABEL }));

    expect(await screen.findByText(GREETING_TEXT)).toBeInTheDocument();
  });

  it('passes a not-found thrown while rendering on to the root not-found screen', async () => {
    renderRouterAt('/missing');

    await waitFor(() => {
      expect(screen.getByText(ROOT_NOT_FOUND_TEXT)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', ROUTE_ERROR_HEADING)).not.toBeInTheDocument();
    expect(recordRouteCatch).not.toHaveBeenCalled();
    expect(recordAppCrash).not.toHaveBeenCalled();
  });

  it('passes a nested not-found through every ancestor route boundary', async () => {
    renderRouterAt('/section/missing');

    await waitFor(() => {
      expect(screen.getByText(ROOT_NOT_FOUND_TEXT)).toBeInTheDocument();
    });
    expect(recordRouteCatch).not.toHaveBeenCalled();
    expect(recordAppCrash).not.toHaveBeenCalled();
  });

  it.each(['/gone', '/section/gone'] as const)(
    'passes a not-found thrown while loading %s on to the root not-found screen',
    async (path) => {
      renderRouterAt(path);

      await waitFor(() => {
        expect(screen.getByText(ROOT_NOT_FOUND_TEXT)).toBeInTheDocument();
      });
      expect(screen.queryByRole('heading', ROUTE_ERROR_HEADING)).not.toBeInTheDocument();
      expect(recordRouteCatch).not.toHaveBeenCalled();
      expect(recordAppCrash).not.toHaveBeenCalled();
    },
  );

  it('escalates a crashing error screen to the app error boundary', async () => {
    loadPage.mockRejectedValue(new Error(LEAKED_DETAIL));
    renderRouterAt('/loaded', { errorScreen: CrashingErrorScreen });

    expect(await screen.findByText(APP_CRASH_TEXT)).toBeInTheDocument();
    expect(recordAppCrash).toHaveBeenCalledExactlyOnceWith(
      new Error(CRASHED_SCREEN_MESSAGE),
      expect.anything(),
    );
  });

  it('sends a crash in the root layout straight to the app error boundary', async () => {
    renderRouterAt('/loaded', { rootLayout: CrashingRootLayout });

    expect(await screen.findByText(APP_CRASH_TEXT)).toBeInTheDocument();
    expect(recordAppCrash).toHaveBeenCalledExactlyOnceWith(
      new Error(CRASHED_LAYOUT_MESSAGE),
      expect.anything(),
    );
    expect(recordRouteCatch).not.toHaveBeenCalled();
  });
});
