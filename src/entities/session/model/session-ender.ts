import type { SessionStore } from './session-store';
import type { SignOutOutcome } from './sign-out-outcome';

export type SessionEndTarget = Pick<SessionStore, 'end'>;

export interface SessionEnder {
  readonly signOut: () => Promise<SignOutOutcome>;
}

export interface CreateSessionEnderOptions {
  readonly store: SessionEndTarget;
  readonly requestSignOut: () => Promise<SignOutOutcome>;
}

export function createSessionEnder(options: CreateSessionEnderOptions): SessionEnder {
  const { store, requestSignOut } = options;

  return {
    signOut: async () => {
      // The local session ends whatever the server answers. A token kept alive because
      // the network was down leaves the next person at this browser signed in.
      try {
        return await requestSignOut();
      } finally {
        store.end();
      }
    },
  };
}
