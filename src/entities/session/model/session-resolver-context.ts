import { createContext, use } from 'react';

import type { SessionResolver } from './session-resolver';

export const SessionResolverContext = createContext<SessionResolver | null>(null);

export function useSessionResolver(): SessionResolver {
  const sessionResolver = use(SessionResolverContext);

  if (sessionResolver === null) {
    throw new Error('useSessionResolver must be called inside a SessionResolverProvider');
  }

  return sessionResolver;
}
