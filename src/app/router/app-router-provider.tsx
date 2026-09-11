import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { useSessionResolver } from '@/entities/session';
import { useHttpClient } from '@/shared/api';

import type { AppRouterContext } from './app-router-context';
import { createAppRouter } from './create-app-router';

export function AppRouterProvider() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();
  const sessionResolver = useSessionResolver();
  const context: AppRouterContext = { httpClient, queryClient, sessionResolver };
  const [router] = useState(() => createAppRouter({ context }));

  return <RouterProvider router={router} context={context} />;
}
