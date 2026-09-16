import type { AppNotification, Notifier } from '@/shared/notifications';

export interface RecordingNotifier {
  readonly notify: Notifier;
  readonly notifications: readonly AppNotification[];
}

export function createRecordingNotifier(notifier: Notifier = () => undefined): RecordingNotifier {
  const notifications: AppNotification[] = [];

  return {
    notify: (notification) => {
      notifications.push(notification);
      notifier(notification);
    },
    notifications,
  };
}
