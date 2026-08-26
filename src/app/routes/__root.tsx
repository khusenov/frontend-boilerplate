import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { NotFoundPage } from '@/pages/not-found';

import type { AppRouterContext } from '../router/app-router-context';

function RootLayout() {
  return (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-left" initialIsOpen={false} />
    </>
  );
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
