import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { createHttpClient, createQueryClient, HttpClientProvider } from '@/shared/api';

interface AppProvidersProps {
  readonly apiBaseUrl: string;
  readonly children: ReactNode;
}

export function AppProviders({ apiBaseUrl, children }: AppProvidersProps) {
  const [httpClient] = useState(() => createHttpClient({ baseUrl: apiBaseUrl }));
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>{children}</HttpClientProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
