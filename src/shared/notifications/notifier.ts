export interface AppNotification {
  readonly message: string;
}

export type Notifier = (notification: AppNotification) => void;
