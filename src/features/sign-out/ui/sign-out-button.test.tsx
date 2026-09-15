import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionEnderProvider } from '@/entities/session';
import type { SessionEnder, SignOutOutcome } from '@/entities/session';

import { SignOutButton } from './sign-out-button';

function createDeferredEnder() {
  const attempts: number[] = [];
  let settle!: (outcome: SignOutOutcome) => void;

  const sessionEnder: SessionEnder = {
    signOut: () => {
      attempts.push(attempts.length + 1);

      return new Promise<SignOutOutcome>((resolve) => {
        settle = resolve;
      });
    },
  };

  return { attempts, sessionEnder, settle: (outcome: SignOutOutcome) => settle(outcome) };
}

function renderButton(sessionEnder: SessionEnder) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSignedOut = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <SessionEnderProvider sessionEnder={sessionEnder}>
        <SignOutButton onSignedOut={onSignedOut} />
      </SessionEnderProvider>
    </QueryClientProvider>,
  );

  return { onSignedOut };
}

describe('SignOutButton', () => {
  it('renders a button that offers to end the session', () => {
    renderButton({ signOut: () => Promise.resolve({ status: 'signed-out' }) });

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('reports the end of the session to its caller', async () => {
    const user = userEvent.setup();
    const { onSignedOut } = renderButton({
      signOut: () => Promise.resolve({ status: 'signed-out' }),
    });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
  });

  it('announces a busy disabled button while the request is in flight', async () => {
    const user = userEvent.setup();
    const { sessionEnder } = createDeferredEnder();
    renderButton(sessionEnder);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    const pendingButton = await screen.findByRole('button', { name: 'Signing out…' });

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
  });

  it('starts no second request while the first is in flight', async () => {
    const user = userEvent.setup();
    const { attempts, sessionEnder } = createDeferredEnder();
    renderButton(sessionEnder);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Signing out…' });
    await user.click(screen.getByRole('button', { name: 'Signing out…' }));

    expect(attempts).toStrictEqual([1]);
  });
});
