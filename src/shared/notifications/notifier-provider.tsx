import { useMemo } from 'react';
import type { ReactNode } from 'react';

import type { Notifier } from './notifier';
import { NotifierContext } from './notifier-context';
import { toSafeNotifier } from './to-safe-notifier';

interface NotifierProviderProps {
  readonly notifier: Notifier;
  readonly children: ReactNode;
}

export function NotifierProvider({ notifier, children }: NotifierProviderProps) {
  const safeNotifier = useMemo(() => toSafeNotifier(notifier), [notifier]);

  return <NotifierContext value={safeNotifier}>{children}</NotifierContext>;
}
