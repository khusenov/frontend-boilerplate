const LOCK_TIMEOUT_MILLISECONDS = 20_000;

type Task<TValue> = () => Promise<TValue>;

interface SingleFlightTask<TValue> {
  readonly run: () => Promise<TValue>;
  readonly isRunning: () => boolean;
}

function supportsWebLocks(): boolean {
  return typeof navigator !== 'undefined' && navigator.locks !== undefined;
}

export function singleFlight<TValue>(
  taskName: string,
  task: Task<TValue>,
): SingleFlightTask<TValue> {
  let inFlight: Promise<TValue> | null = null;

  const runTask = async (): Promise<TValue> => task();

  function runExclusively(): Promise<TValue> {
    if (!supportsWebLocks()) {
      return runTask();
    }

    return navigator.locks.request(
      taskName,
      { signal: AbortSignal.timeout(LOCK_TIMEOUT_MILLISECONDS) },
      runTask,
    );
  }

  return {
    run: () => {
      inFlight ??= runExclusively().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
    isRunning: () => inFlight !== null,
  };
}
