import { toast } from 'sonner';

import type { Notifier } from './notifier';

export function createSonnerNotifier(): Notifier {
  return ({ message }) => {
    toast.success(message);
  };
}
