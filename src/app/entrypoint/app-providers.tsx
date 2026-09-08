import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';

import { createQueryClient, HttpClientProvider } from '@/shared/api';
import { createI18n, I18nProvider } from '@/shared/i18n';

import { createAuthenticatedTransport } from './create-authenticated-transport';

interface AppProvidersProps {
  readonly apiBaseUrl: string;
  readonly children: ReactNode;
}

export function AppProviders({ apiBaseUrl, children }: AppProvidersProps) {
  const [transport] = useState(() => createAuthenticatedTransport(apiBaseUrl));
  const [queryClient] = useState(() => createQueryClient());
  const [i18n] = useState(() => createI18n());

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
