import { afterEach, describe, expect, it, vi } from 'vitest';

import { toSafeErrorReporter } from './to-safe-error-reporter';

describe('toSafeErrorReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the report to the wrapped reporter', () => {
    const reportError = vi.fn();
    const error = new Error('boom');

    toSafeErrorReporter(reportError)({ source: 'query', error, queryHash: '["users","1"]' });

    expect(reportError).toHaveBeenCalledWith({
      source: 'query',
      error,
      queryHash: '["users","1"]',
    });
  });

  it('logs to the console when the wrapped reporter throws, instead of rethrowing', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sinkFailure = new Error('the sink is broken');
    const reportError = vi.fn(() => {
      throw sinkFailure;
    });

    expect(() => {
      toSafeErrorReporter(reportError)({
        source: 'render',
        error: new Error('boom'),
        componentStack: '\n at App',
      });
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('the error reporter failed', sinkFailure, 'render');
  });

  it('keeps forwarding after the wrapped reporter throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reportError = vi.fn().mockImplementationOnce(() => {
      throw new Error('the sink is broken');
    });
    const safeReportError = toSafeErrorReporter(reportError);

    safeReportError({ source: 'render', error: new Error('first'), componentStack: '' });
    safeReportError({ source: 'query', error: new Error('second'), queryHash: '[]' });

    expect(reportError).toHaveBeenCalledTimes(2);
  });
});
