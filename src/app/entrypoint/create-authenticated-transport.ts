import {
  createSessionApi,
  createSessionStarter,
  createSessionStore,
  createSessionTokenSource,
  toSessionObserver,
} from '@/entities/session';
import type { SessionObserver, SessionStarter } from '@/entities/session';
import { createHttpClient } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

export interface AuthenticatedTransport {
  readonly httpClient: HttpClient;
  readonly sessionObserver: SessionObserver;
  readonly sessionStarter: SessionStarter;
}

export function createAuthenticatedTransport(baseUrl: string): AuthenticatedTransport {
  const sessionStore = createSessionStore();
  const unauthenticatedClient = createHttpClient({ baseUrl, sendCookies: true });
  const sessionApi = createSessionApi(unauthenticatedClient);
  const bearerTokenSource = createSessionTokenSource({
    store: sessionStore,
    refresh: sessionApi.refresh,
  });

  return {
    httpClient: createHttpClient({ baseUrl, bearerTokenSource }),
    sessionObserver: toSessionObserver(sessionStore),
    sessionStarter: createSessionStarter({
      store: sessionStore,
      requestSignIn: sessionApi.signIn,
    }),
  };
}
