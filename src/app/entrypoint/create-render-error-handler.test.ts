import { describe, expect, it, vi } from 'vitest';

import { createRenderErrorHandler } from './create-render-error-handler';

describe('createRenderErrorHandler', () => {
  it('reports the component stack React supplied', () => {
    const reportError = vi.fn();
    const error = new Error('boom');

    createRenderErrorHandler(reportError)(error, { componentStack: '\n at App' });

    expect(reportError).toHaveBeenCalledWith({
      source: 'render',
      error,
      componentStack: '\n at App',
    });
  });

  it('reports an empty stack when React supplies none', () => {
    const reportError = vi.fn();
    const error = new Error('boom');

    createRenderErrorHandler(reportError)(error, { componentStack: null });

    expect(reportError).toHaveBeenCalledWith({ source: 'render', error, componentStack: '' });
  });
});
