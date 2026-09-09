import type { Credentials } from './credentials';
import type { SessionStore } from './session-store';
import type { SignInOutcome, SignInResult } from './sign-in-result';

export type SessionStartTarget = Pick<SessionStore, 'start'>;

export interface SessionStarter {
  readonly signIn: (credentials: Credentials) => Promise<SignInOutcome>;
}

export interface CreateSessionStarterOptions {
  readonly store: SessionStartTarget;
  readonly requestSignIn: (credentials: Credentials) => Promise<SignInResult>;
}

export function createSessionStarter(options: CreateSessionStarterOptions): SessionStarter {
  const { store, requestSignIn } = options;

  return {
    signIn: async (credentials) => {
      const result = await requestSignIn(credentials);

      if (result.status !== 'signed-in') {
        return { status: result.status };
      }

      store.start(result.accessToken);

      return { status: 'signed-in' };
    },
  };
}
