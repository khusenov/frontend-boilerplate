import type { ReactNode } from 'react';

import type { SessionStarter } from './session-starter';
import { SessionStarterContext } from './session-starter-context';

interface SessionStarterProviderProps {
  readonly sessionStarter: SessionStarter;
  readonly children: ReactNode;
}

export function SessionStarterProvider({ sessionStarter, children }: SessionStarterProviderProps) {
  return <SessionStarterContext value={sessionStarter}>{children}</SessionStarterContext>;
}
