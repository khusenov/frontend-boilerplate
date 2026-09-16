import { createContext, use } from 'react';

import type { Notifier } from './notifier';

export const NotifierContext = createContext<Notifier | null>(null);

export function useNotifier(): Notifier {
  const notify = use(NotifierContext);

  if (notify === null) {
    throw new Error('useNotifier must be called inside a NotifierProvider');
  }

  return notify;
}
