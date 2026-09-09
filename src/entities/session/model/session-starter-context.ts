import { createContext, use } from 'react';

import type { SessionStarter } from './session-starter';

export const SessionStarterContext = createContext<SessionStarter | null>(null);

export function useSessionStarter(): SessionStarter {
  const sessionStarter = use(SessionStarterContext);

  if (sessionStarter === null) {
    throw new Error('useSessionStarter must be called inside a SessionStarterProvider');
  }

  return sessionStarter;
}
