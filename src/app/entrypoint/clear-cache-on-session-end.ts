import type { QueryClient } from '@tanstack/react-query';

import type { SessionObserver } from '@/entities/session';

export type CacheResetTarget = Pick<QueryClient, 'clear'>;

export function clearCacheOnSessionEnd(
  session: SessionObserver,
  cache: CacheResetTarget,
): () => void {
  let observed = session.status();

  return session.subscribe(() => {
    const left = observed;
    observed = session.status();

    if (left === 'authenticated') {
      cache.clear();
    }
  });
}
