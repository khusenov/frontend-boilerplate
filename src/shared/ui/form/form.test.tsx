import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useAppForm } from './use-app-form';

type RejectionListener = (reason: unknown) => void;

interface RejectionEmitter {
  readonly on: (event: 'unhandledRejection', listener: RejectionListener) => void;
  readonly off: (event: 'unhandledRejection', listener: RejectionListener) => void;
}

// @types/node is deliberately absent from tsconfig.app.json, so `process` has no global type here.
const rejectionEmitter = (globalThis as unknown as { readonly process: RejectionEmitter }).process;

async function flushRejectionTracking() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface FormHarnessProps {
  readonly className?: string | undefined;
  readonly onSubmit?: (() => Promise<void>) | undefined;
  readonly onSubmitError?: ((error: unknown) => void) | undefined;
}

function FormHarness({ className, onSubmit, onSubmitError }: FormHarnessProps) {
  const form = useAppForm({
    defaultValues: { email: '' },
    onSubmit: async () => {
      await onSubmit?.();
    },
  });

  return (
    <form.AppForm>
      <form.Form aria-label="Sign in" className={className} onSubmitError={onSubmitError}>
        <form.SubmitButton>Sign in</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

describe('Form', () => {
  it('turns off native validation so schema messages are not pre-empted by browser bubbles', () => {
    render(<FormHarness />);

    expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('novalidate');
  });

  it('runs the form onSubmit handler without letting the document navigate', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => Promise.resolve());
    const onNativeSubmit = vi.fn();
    document.addEventListener('submit', onNativeSubmit);

    try {
      render(<FormHarness onSubmit={onSubmit} />);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onNativeSubmit).toHaveBeenCalledOnce();
      expect(onNativeSubmit.mock.calls[0]?.[0]).toMatchObject({ defaultPrevented: true });
    } finally {
      document.removeEventListener('submit', onNativeSubmit);
    }
  });

  it('forwards a caller class to the element', () => {
    render(<FormHarness className="grid gap-4" />);

    expect(screen.getByRole('form', { name: 'Sign in' })).toHaveClass('grid', 'gap-4');
  });

  it('routes a rejecting submit to onSubmitError instead of leaving it unhandled', async () => {
    const user = userEvent.setup();
    const failure = new Error('Request failed');
    const onSubmitError = vi.fn();
    const unhandled = vi.fn();
    rejectionEmitter.on('unhandledRejection', unhandled);

    try {
      render(
        <FormHarness onSubmit={() => Promise.reject(failure)} onSubmitError={onSubmitError} />,
      );
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(onSubmitError).toHaveBeenCalledWith(failure);
      });
      await flushRejectionTracking();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      rejectionEmitter.off('unhandledRejection', unhandled);
    }
  });

  it('leaves no unhandled rejection when a rejecting submit has no onSubmitError', async () => {
    const user = userEvent.setup();
    const unhandled = vi.fn();
    rejectionEmitter.on('unhandledRejection', unhandled);

    try {
      render(<FormHarness onSubmit={() => Promise.reject(new Error('Request failed'))} />);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
      });
      await flushRejectionTracking();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      rejectionEmitter.off('unhandledRejection', unhandled);
    }
  });
});
