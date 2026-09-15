import { createContext, use } from 'react';

import type { SessionEnder } from './session-ender';

export const SessionEnderContext = createContext<SessionEnder | null>(null);

export function useSessionEnder(): SessionEnder {
  const sessionEnder = use(SessionEnderContext);

  if (sessionEnder === null) {
    throw new Error('useSessionEnder must be called inside a SessionEnderProvider');
  }

  return sessionEnder;
}
