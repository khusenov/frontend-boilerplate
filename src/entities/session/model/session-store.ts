import type { AccessToken } from './access-token';
import type { SessionState, SessionStatus } from './session-state';

const ANONYMOUS_SESSION: SessionState = { status: 'anonymous' };
const UNKNOWN_SESSION: SessionState = { status: 'unknown' };

export type SessionListener = () => void;

export interface SessionStore {
  readonly read: () => SessionState;
  readonly subscribe: (listener: SessionListener) => () => void;
  readonly start: (accessToken: AccessToken) => void;
  readonly end: () => void;
}

export interface SessionObserver {
  readonly status: () => SessionStatus;
  readonly subscribe: (listener: SessionListener) => () => void;
}

export type SessionRenewalTarget = Pick<SessionStore, 'end' | 'read' | 'start'>;

function isSameSession(current: SessionState, next: SessionState): boolean {
  return current.status === 'authenticated' && next.status === 'authenticated'
    ? current.accessToken === next.accessToken
    : current.status === next.status;
}

export function createSessionStore(): SessionStore {
  let state: SessionState = UNKNOWN_SESSION;
  const listeners = new Set<SessionListener>();

  function publish(next: SessionState): void {
    if (isSameSession(state, next)) {
      return;
    }

    state = next;

    for (const listener of [...listeners]) {
      listener();
    }
  }

  return {
    read: () => state,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    start: (accessToken) => {
      publish({ status: 'authenticated', accessToken });
    },
    end: () => {
      publish(ANONYMOUS_SESSION);
    },
  };
}

export function toSessionObserver(store: SessionStore): SessionObserver {
  return {
    status: () => store.read().status,
    subscribe: store.subscribe,
  };
}
