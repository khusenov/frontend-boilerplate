import { describe, expect, it, vi } from 'vitest';

import { createQueryErrorHandlers } from './create-query-error-handlers';

describe('createQueryErrorHandlers', () => {
  it('reports a query failure with its serialised key', () => {
    const reportError = vi.fn();
    const error = new Error('boom');

    createQueryErrorHandlers(reportError).onQueryError(error, '["users","1"]');

    expect(reportError).toHaveBeenCalledWith({
      source: 'query',
      error,
      queryHash: '["users","1"]',
    });
  });

  it('reports a mutation failure with its serialised key', () => {
    const reportError = vi.fn();
    const error = new Error('boom');

    createQueryErrorHandlers(reportError).onMutationError(error, '["users","update-name"]');

    expect(reportError).toHaveBeenCalledWith({
      source: 'mutation',
      error,
      mutationHash: '["users","update-name"]',
    });
  });
});
