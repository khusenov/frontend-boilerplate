import type { ReactNode } from 'react';

import type { HttpClient } from './http-client';
import { HttpClientContext } from './http-client-context';

interface HttpClientProviderProps {
  readonly client: HttpClient;
  readonly children: ReactNode;
}

export function HttpClientProvider({ client, children }: HttpClientProviderProps) {
  return <HttpClientContext value={client}>{children}</HttpClientContext>;
}
