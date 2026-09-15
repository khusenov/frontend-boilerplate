import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { NotFoundPage } from '@/pages/not-found';
import { appConfig } from '@/shared/config';
import { AppHeader } from '@/widgets/app-header';

import type { AppRouterContext } from '../router/app-router-context';

function RootLayout() {
  return (
    <>
      <AppHeader appName={appConfig.name} />
      <Outlet />
      <TanStackRouterDevtools position="bottom-left" initialIsOpen={false} />
    </>
  );
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
