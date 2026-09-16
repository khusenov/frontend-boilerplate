import { afterEach, describe, expect, it, vi } from 'vitest';

import { toSafeNotifier } from './to-safe-notifier';

describe('toSafeNotifier', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the notification to the wrapped notifier', () => {
    const notify = vi.fn();

    toSafeNotifier(notify)({ message: 'Name updated.' });

    expect(notify).toHaveBeenCalledWith({ message: 'Name updated.' });
  });

  it('logs to the console when the wrapped notifier throws, instead of rethrowing', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notifierFailure = new Error('the toast host is broken');
    const notify = vi.fn(() => {
      throw notifierFailure;
    });

    expect(() => {
      toSafeNotifier(notify)({ message: 'Name updated.' });
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('the notifier failed', notifierFailure);
  });

  it('logs a rejecting async notifier instead of leaving the rejection unhandled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notifierFailure = new Error('the toast host is broken');
    const asyncNotifier = (() => Promise.reject(notifierFailure)) as unknown as Parameters<
      typeof toSafeNotifier
    >[0];

    toSafeNotifier(asyncNotifier)({ message: 'Name updated.' });
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('the notifier failed', notifierFailure);
    });
  });

  it('keeps forwarding after the wrapped notifier throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notify = vi.fn().mockImplementationOnce(() => {
      throw new Error('the toast host is broken');
    });
    const safeNotify = toSafeNotifier(notify);

    safeNotify({ message: 'first' });
    safeNotify({ message: 'second' });

    expect(notify).toHaveBeenCalledTimes(2);
  });
});
