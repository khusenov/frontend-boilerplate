import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { createQueryClient, HttpClientProvider } from '@/shared/api';
import { createI18n, I18nProvider } from '@/shared/i18n';

import { clearCacheOnSessionEnd } from './clear-cache-on-session-end';
import { createAuthenticatedTransport } from './create-authenticated-transport';
import type { QueryErrorHandlers } from './create-query-error-handlers';

interface AppProvidersProps {
  readonly apiBaseUrl: string;
  readonly queryErrorHandlers: QueryErrorHandlers;
  readonly children: ReactNode;
}

export function AppProviders({ apiBaseUrl, queryErrorHandlers, children }: AppProvidersProps) {
  const [transport] = useState(() => createAuthenticatedTransport(apiBaseUrl));
  const [queryClient] = useState(() => createQueryClient(queryErrorHandlers));
  const [i18n] = useState(() => createI18n());

  useEffect(
    () => clearCacheOnSessionEnd(transport.sessionObserver, queryClient),
    [transport, queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <I18nProvider i18n={i18n}>
          <HttpClientProvider client={transport.httpClient}>{children}</HttpClientProvider>
        </I18nProvider>
      </Suspense>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
