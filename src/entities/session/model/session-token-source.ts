import type { BearerTokenSource } from '@/shared/api';
import { appConfig } from '@/shared/config';
import { singleFlight } from '@/shared/lib/single-flight';

import type { AccessToken } from './access-token';
import type { RefreshResult } from './refresh-result';
import type { SessionStatus } from './session-state';
import { readAccessToken } from './session-state';
import type { SessionRenewalTarget } from './session-store';

const REFRESH_TASK_NAME = `${appConfig.name}:session-refresh`;

export interface CreateSessionTokenSourceOptions {
  readonly store: SessionRenewalTarget;
  readonly refresh: () => Promise<RefreshResult>;
}

export interface SessionTokenSource extends BearerTokenSource {
  readonly settle: () => Promise<SessionStatus>;
}

export function createSessionTokenSource(
  options: CreateSessionTokenSourceOptions,
): SessionTokenSource {
  const { store, refresh } = options;

  function applyResult(result: RefreshResult): AccessToken | null {
    switch (result.status) {
      case 'expired':
        store.end();

        return null;
      case 'refreshed':
        store.start(result.accessToken);

        return result.accessToken;
      case 'unavailable':
        return null;
    }
  }

  const renewal = singleFlight(REFRESH_TASK_NAME, async () => applyResult(await refresh()));

  async function joinRenewal(): Promise<AccessToken | null> {
    try {
      return await renewal.run();
    } catch {
      return null;
    }
  }

  return {
    getToken: () => readAccessToken(store.read()),
    settle: async () => {
      const status = store.read().status;

      if (status !== 'unknown') {
        return status;
      }

      await joinRenewal();

      return store.read().status;
    },
    renewToken: async (staleToken) => {
      const state = store.read();

      if (state.status === 'anonymous') {
        return null;
      }

      if (renewal.isRunning() || readAccessToken(state) === staleToken) {
        return joinRenewal();
      }

      return readAccessToken(state);
    },
  };
}
