import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConsoleErrorReporter } from './console-error-reporter';

describe('createConsoleErrorReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the component stack for a render failure', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('boom');

    createConsoleErrorReporter()({ source: 'render', error, componentStack: '\n at App' });

    expect(consoleError).toHaveBeenCalledWith('error reported from render', error, '\n at App');
  });

  it('logs the query hash for a query failure', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('boom');

    createConsoleErrorReporter()({ source: 'query', error, queryHash: '["users","1"]' });

    expect(consoleError).toHaveBeenCalledWith('error reported from query', error, '["users","1"]');
  });

  it('logs the mutation hash for a mutation failure', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('boom');

    createConsoleErrorReporter()({
      source: 'mutation',
      error,
      mutationHash: '["users","update-name"]',
    });

    expect(consoleError).toHaveBeenCalledWith(
      'error reported from mutation',
      error,
      '["users","update-name"]',
    );
  });
});
