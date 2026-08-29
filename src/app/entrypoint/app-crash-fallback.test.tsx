import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/shared/ui/error-boundary';

import { AppCrashFallback } from './app-crash-fallback';

function LeakyChild(): never {
  throw new Error('https://api.internal/v1/users?token=leaked');
}

describe('AppCrashFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves focus to the heading so assistive technology reaches the failure', () => {
    render(<AppCrashFallback resetErrorBoundary={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toHaveFocus();
  });

  it('explains what happened', () => {
    render(<AppCrashFallback resetErrorBoundary={vi.fn()} />);

    expect(
      screen.getByText('The application could not start. Trying again may fix it.'),
    ).toBeInTheDocument();
  });

  it('retries through the reset the boundary supplied', async () => {
    const user = userEvent.setup();
    const resetErrorBoundary = vi.fn();
    render(<AppCrashFallback resetErrorBoundary={resetErrorBoundary} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(resetErrorBoundary).toHaveBeenCalledOnce();
  });

  it('never renders the thrown message when mounted by a real boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary FallbackComponent={AppCrashFallback}>
        <LeakyChild />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(/leaked/)).not.toBeInTheDocument();
  });
});
