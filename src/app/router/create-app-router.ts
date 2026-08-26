import { createRouter } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';

import type { AppRouterContext } from './app-router-context';
import { routeTree } from './routeTree.gen';

const ROUTER_PRELOAD_STALE_TIME_MILLISECONDS = 0;

export interface CreateAppRouterOptions {
  readonly context: AppRouterContext;
  readonly history?: RouterHistory;
}

export function createAppRouter(options: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: ROUTER_PRELOAD_STALE_TIME_MILLISECONDS,
    scrollRestoration: true,
    ...options,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
