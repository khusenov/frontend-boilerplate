import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ButtonProps } from '@/shared/ui/button';

import { useAppForm } from './use-app-form';

const signInSchema = z.object({ email: z.email('Enter a valid email address') });

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolveSubmit) => {
    resolve = resolveSubmit;
  });

  return { promise, resolve };
}

interface SubmitHarnessProps {
  readonly disabled?: boolean | undefined;
  readonly onSubmit?: (() => Promise<void>) | undefined;
  readonly pendingLabel?: ReactNode | undefined;
  readonly variant?: ButtonProps['variant'];
}

function SubmitHarness({ disabled, onSubmit, pendingLabel, variant }: SubmitHarnessProps) {
  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onChange: signInSchema },
    onSubmit: async () => {
      await onSubmit?.();
    },
  });

  return (
    <form.AppForm>
      <form.Form aria-label="Sign in">
        <form.AppField name="email">
          {(field) => <field.TextField label="Email" type="email" />}
        </form.AppField>
        <form.SubmitButton disabled={disabled} pendingLabel={pendingLabel} variant={variant}>
          Sign in
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

describe('SubmitButton', () => {
  it('submits the enclosing form when its accessible name is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<SubmitHarness onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });

  it('stays enabled while the form is invalid so clicking it surfaces the errors', async () => {
    const user = userEvent.setup();
    render(<SubmitHarness />);

    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeEnabled();

    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address');
  });

  it('forwards a caller variant to the rendered button', () => {
    render(<SubmitHarness variant="secondary" />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('honours a caller disabled alongside its own', () => {
    render(<SubmitHarness disabled />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('swaps to the pending label and reports busy while a submit is in flight', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    render(<SubmitHarness onSubmit={() => deferred.promise} pendingLabel="Signing in…" />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const pending = await screen.findByRole('button', { name: 'Signing in…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });
  });

  it('keeps rendering its children while in flight without a pending label', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    render(<SubmitHarness onSubmit={() => deferred.promise} />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    });

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });
  });
});
