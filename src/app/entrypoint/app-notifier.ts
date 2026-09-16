import { createSonnerNotifier, toSafeNotifier } from '@/shared/notifications';

export const notify = toSafeNotifier(createSonnerNotifier());
