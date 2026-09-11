import type { ReactNode } from 'react';

import type { SessionResolver } from './session-resolver';
import { SessionResolverContext } from './session-resolver-context';

interface SessionResolverProviderProps {
  readonly sessionResolver: SessionResolver;
  readonly children: ReactNode;
}

export function SessionResolverProvider({
  sessionResolver,
  children,
}: SessionResolverProviderProps) {
  return <SessionResolverContext value={sessionResolver}>{children}</SessionResolverContext>;
}
