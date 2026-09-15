import type { ReactNode } from 'react';

import type { SessionEnder } from './session-ender';
import { SessionEnderContext } from './session-ender-context';

interface SessionEnderProviderProps {
  readonly sessionEnder: SessionEnder;
  readonly children: ReactNode;
}

export function SessionEnderProvider({ sessionEnder, children }: SessionEnderProviderProps) {
  return <SessionEnderContext value={sessionEnder}>{children}</SessionEnderContext>;
}
