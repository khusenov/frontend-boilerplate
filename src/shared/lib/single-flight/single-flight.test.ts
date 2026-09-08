import { afterEach, describe, expect, it, vi } from 'vitest';

import { singleFlight } from './single-flight';

const TASK_NAME = 'test:renewal';

function createDeferred<TValue>() {
  let settle!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolve) => {
    settle = resolve;
  });

  return { promise, settle };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('singleFlight', () => {
  it('runs the task once for concurrent callers and resolves them all with its value', async () => {
    const task = vi.fn(() => Promise.resolve('token'));
    const renewal = singleFlight(TASK_NAME, task);

    await expect(Promise.all([renewal.run(), renewal.run(), renewal.run()])).resolves.toStrictEqual(
      ['token', 'token', 'token'],
    );
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('starts a new flight once the previous one has settled', async () => {
    const tokens = ['first', 'second'];
    const task = vi.fn(() => Promise.resolve(tokens.shift() ?? 'exhausted'));
    const renewal = singleFlight(TASK_NAME, task);

    await expect(renewal.run()).resolves.toBe('first');
    await expect(renewal.run()).resolves.toBe('second');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('rejects every concurrent caller and releases the slot for the next one', async () => {
    const task = vi.fn(() => Promise.reject(new Error('renewal failed')));
    const renewal = singleFlight(TASK_NAME, task);

    const outcomes = await Promise.allSettled([renewal.run(), renewal.run()]);

    expect(outcomes.map((outcome) => outcome.status)).toStrictEqual(['rejected', 'rejected']);
    expect(task).toHaveBeenCalledTimes(1);

    await expect(renewal.run()).rejects.toThrow('renewal failed');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('turns a synchronous throw into a rejection and leaves the slot usable', async () => {
    const task = vi.fn((): Promise<string> => {
      throw new Error('boom');
    });
    const renewal = singleFlight(TASK_NAME, task);
    let firstAttempt: Promise<unknown> | undefined;

    expect(() => {
      firstAttempt = renewal.run().catch((error: unknown) => error);
    }).not.toThrow();

    await expect(firstAttempt).resolves.toMatchObject({ message: 'boom' });
    await expect(renewal.run()).rejects.toThrow('boom');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('reports a flight as running only while its task is pending', async () => {
    const deferred = createDeferred<string>();
    const renewal = singleFlight(TASK_NAME, () => deferred.promise);

    expect(renewal.isRunning()).toBe(false);

    const pending = renewal.run();

    expect(renewal.isRunning()).toBe(true);

    deferred.settle('token');

    await expect(pending).resolves.toBe('token');
    expect(renewal.isRunning()).toBe(false);
  });

  it('runs the task inside a named web lock with a bounded wait', async () => {
    const lockRequests: { name: string; options: LockOptions }[] = [];
    const request = vi.fn((name: string, options: LockOptions, task: () => Promise<string>) => {
      lockRequests.push({ name, options });

      return task();
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const renewal = singleFlight(TASK_NAME, () => Promise.resolve('token'));

    await expect(renewal.run()).resolves.toBe('token');
    expect(lockRequests).toHaveLength(1);
    expect(lockRequests[0]?.name).toBe(TASK_NAME);
    expect(lockRequests[0]?.options.signal).toBeInstanceOf(AbortSignal);
  });

  it('still runs the task where web locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const renewal = singleFlight(TASK_NAME, () => Promise.resolve('token'));

    await expect(renewal.run()).resolves.toBe('token');
  });
});
