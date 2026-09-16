import type { Notifier } from './notifier';

function reportNotifierFailure(failure: unknown): void {
  console.error('the notifier failed', failure);
}

export function toSafeNotifier(notify: Notifier): Notifier {
  return (notification) => {
    try {
      // Notifier returns void, and void-return bivariance lets an async notifier through the
      // type system; its rejection would otherwise escape this catch unhandled.
      const raised: unknown = notify(notification);

      if (typeof (raised as { then?: unknown } | undefined)?.then === 'function') {
        Promise.resolve(raised).catch(reportNotifierFailure);
      }
    } catch (notifierFailure) {
      reportNotifierFailure(notifierFailure);
    }
  };
}
