import {
  createAccessTokenStore,
  createSessionApi,
  createSessionTokenSource,
} from '@/entities/session';
import { createHttpClient } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

export interface AuthenticatedTransport {
  readonly httpClient: HttpClient;
}

export function createAuthenticatedTransport(baseUrl: string): AuthenticatedTransport {
  const unauthenticatedClient = createHttpClient({ baseUrl, sendCookies: true });
  const bearerTokenSource = createSessionTokenSource({
    store: createAccessTokenStore(),
    refresh: createSessionApi(unauthenticatedClient).refresh,
  });

  return { httpClient: createHttpClient({ baseUrl, bearerTokenSource }) };
}
