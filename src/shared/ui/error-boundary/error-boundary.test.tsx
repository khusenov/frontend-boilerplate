import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './error-boundary';
import type { ErrorFallbackProps } from './error-boundary';

const repair = { done: false };

function Fragile({ shouldFail }: { readonly shouldFail: boolean }) {
  if (shouldFail) {
    throw new Error('Rendering failed');
  }

  return <p>Rendered</p>;
}

function RepairableFragile() {
  if (!repair.done) {
    throw new Error('Rendering failed');
  }

  return <p>Rendered</p>;
}

function MessageFallback({ error }: Pick<ErrorFallbackProps, 'error'>) {
  return <p role="alert">{error instanceof Error ? error.message : 'Unknown'}</p>;
}

function HookedFallback() {
  const [message] = useState('Fallback mounted');

  return <p role="alert">{message}</p>;
}

function RepairFallback({ resetErrorBoundary }: Pick<ErrorFallbackProps, 'resetErrorBoundary'>) {
  return (
    <button
      type="button"
      onClick={() => {
        repair.done = true;
        resetErrorBoundary();
      }}
    >
      Retry
    </button>
  );
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    repair.done = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary FallbackComponent={MessageFallback}>
        <Fragile shouldFail={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Rendered')).toBeInTheDocument();
  });

  it('renders the fallback with the thrown error when a child throws', () => {
    render(
      <ErrorBoundary FallbackComponent={MessageFallback}>
        <Fragile shouldFail />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Rendering failed');
  });

  it('gives the fallback its own fiber so it may use hooks', () => {
    render(
      <ErrorBoundary FallbackComponent={HookedFallback}>
        <Fragile shouldFail />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Fallback mounted');
  });

  it('reports the failure to a caller-supplied reporter', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary FallbackComponent={MessageFallback} onError={onError}>
        <Fragile shouldFail />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledOnce();
  });

  it('renders children again once the fallback resets the boundary', async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary FallbackComponent={RepairFallback}>
        <RepairableFragile />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('Rendered')).toBeInTheDocument();
  });
});
