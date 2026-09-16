import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionEnderProvider } from '@/entities/session';
import type { SessionEnder, SignOutOutcome } from '@/entities/session';
import { renderWithProviders } from '@/shared/testing';

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
  const onSignedOut = vi.fn();

  const { user } = renderWithProviders(<SignOutButton onSignedOut={onSignedOut} />, {
    wrappers: [
      ({ children }) => (
        <SessionEnderProvider sessionEnder={sessionEnder}>{children}</SessionEnderProvider>
      ),
    ],
  });

  return { onSignedOut, user };
}

describe('SignOutButton', () => {
  it('renders a button that offers to end the session', () => {
    renderButton({ signOut: () => Promise.resolve({ status: 'signed-out' }) });

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('reports the end of the session to its caller', async () => {
    const { onSignedOut, user } = renderButton({
      signOut: () => Promise.resolve({ status: 'signed-out' }),
    });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
  });

  it('announces a busy disabled button while the request is in flight', async () => {
    const { sessionEnder } = createDeferredEnder();
    const { user } = renderButton(sessionEnder);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    const pendingButton = await screen.findByRole('button', { name: 'Signing out…' });

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
  });

  it('starts no second request while the first is in flight', async () => {
    const { attempts, sessionEnder } = createDeferredEnder();
    const { user } = renderButton(sessionEnder);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Signing out…' });
    await user.click(screen.getByRole('button', { name: 'Signing out…' }));

    expect(attempts).toStrictEqual([1]);
  });
});
