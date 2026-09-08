import {
  createSessionApi,
  createSessionStore,
  createSessionTokenSource,
  toSessionObserver,
} from '@/entities/session';
import type { SessionObserver } from '@/entities/session';
import { createHttpClient } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

export interface AuthenticatedTransport {
  readonly httpClient: HttpClient;
  readonly sessionObserver: SessionObserver;
}

export function createAuthenticatedTransport(baseUrl: string): AuthenticatedTransport {
  const sessionStore = createSessionStore();
  const unauthenticatedClient = createHttpClient({ baseUrl, sendCookies: true });
  const bearerTokenSource = createSessionTokenSource({
    store: sessionStore,
    refresh: createSessionApi(unauthenticatedClient).refresh,
  });

  return {
    httpClient: createHttpClient({ baseUrl, bearerTokenSource }),
    sessionObserver: toSessionObserver(sessionStore),
  };
}
