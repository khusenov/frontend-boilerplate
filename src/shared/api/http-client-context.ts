import { createContext, use } from 'react';

import type { HttpClient } from './http-client';

export const HttpClientContext = createContext<HttpClient | null>(null);

export function useHttpClient(): HttpClient {
  const httpClient = use(HttpClientContext);

  if (httpClient === null) {
    throw new Error('useHttpClient must be called inside an HttpClientProvider');
  }

  return httpClient;
}
