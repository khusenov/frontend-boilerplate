import type { BearerTokenSource } from '@/shared/api';
import { appConfig } from '@/shared/config';
import { singleFlight } from '@/shared/lib/single-flight';

import type { AccessToken } from './access-token';
import type { AccessTokenStore } from './access-token-store';
import type { RefreshResult } from './refresh-result';

const REFRESH_TASK_NAME = `${appConfig.name}:session-refresh`;

export interface CreateSessionTokenSourceOptions {
  readonly store: AccessTokenStore;
  readonly refresh: () => Promise<RefreshResult>;
}

export function createSessionTokenSource(
  options: CreateSessionTokenSourceOptions,
): BearerTokenSource {
  const { store, refresh } = options;

  function applyResult(result: RefreshResult): AccessToken | null {
    if (result.status === 'refreshed') {
      store.write(result.accessToken);

      return result.accessToken;
    }

    if (result.status === 'expired') {
      store.clear();
    }

    return null;
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
    getToken: () => store.read(),
    renewToken: async (staleToken) => {
      if (store.hasEnded()) {
        return null;
      }

      if (renewal.isRunning() || store.read() === staleToken) {
        return joinRenewal();
      }

      return store.read();
    },
  };
}
