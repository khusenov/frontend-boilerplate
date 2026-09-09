import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionStarterProvider } from '@/entities/session';
import type { Credentials, SessionStarter, SignInOutcome } from '@/entities/session';

import { SignInForm } from './sign-in-form';

function createDeferred() {
  let resolve!: (outcome: SignInOutcome) => void;
  const promise = new Promise<SignInOutcome>((resolveSignIn) => {
    resolve = resolveSignIn;
  });

  return { promise, resolve };
}

function createRecordingStarter(
  outcome: SignInOutcome,
  attempts: Credentials[] = [],
): SessionStarter {
  return {
    signIn: (credentials) => {
      attempts.push(credentials);

      return Promise.resolve(outcome);
    },
  };
}

function renderForm(sessionStarter: SessionStarter) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSignedIn = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <SessionStarterProvider sessionStarter={sessionStarter}>
        <SignInForm onSignedIn={onSignedIn} />
      </SessionStarterProvider>
    </QueryClientProvider>,
  );

  return { onSignedIn, user: userEvent.setup() };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
}

describe('SignInForm', () => {
  it('names itself and declares both autocomplete purposes for a password manager', () => {
    renderForm(createRecordingStarter({ status: 'signed-in' }));

    expect(screen.getByRole('form', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('masks the password control', () => {
    renderForm(createRecordingStarter({ status: 'signed-in' }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('starts with both controls empty and a mounted, empty live region', () => {
    renderForm(createRecordingStarter({ status: 'signed-in' }));

    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('forwards the credentials verbatim, leaving normalisation to the session mapper', async () => {
    const attempts: Credentials[] = [];
    const { user } = renderForm(createRecordingStarter({ status: 'signed-in' }, attempts));

    await fillIn(user, 'Ada@Example.test', ' correct horse ');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(attempts).toStrictEqual([{ email: 'Ada@Example.test', password: ' correct horse ' }]);
    });
  });

  it('notifies the caller when sign-in succeeds', async () => {
    const { onSignedIn, user } = renderForm(createRecordingStarter({ status: 'signed-in' }));

    await fillIn(user, 'ada@example.test', 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
  });

  it('reports a malformed address and attempts no sign-in', async () => {
    const attempts: Credentials[] = [];
    const { user } = renderForm(createRecordingStarter({ status: 'signed-in' }, attempts));

    await fillIn(user, 'not-an-email', 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await within(screen.getByRole('form', { name: 'Sign in' })).findByText(
        'Enter a valid email address.',
      ),
    ).toBeInTheDocument();
    expect(attempts).toStrictEqual([]);
  });

  it('reports a missing password and attempts no sign-in', async () => {
    const attempts: Credentials[] = [];
    const { user } = renderForm(createRecordingStarter({ status: 'signed-in' }, attempts));

    await user.type(screen.getByLabelText('Email'), 'ada@example.test');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await within(screen.getByRole('form', { name: 'Sign in' })).findByText(
        'Enter your password.',
      ),
    ).toBeInTheDocument();
    expect(attempts).toStrictEqual([]);
  });

  it('announces a rejection without revealing which field was wrong', async () => {
    const { onSignedIn, user } = renderForm(createRecordingStarter({ status: 'rejected' }));

    await fillIn(user, 'ada@example.test', 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('announces a rate limit', async () => {
    const { user } = renderForm(createRecordingStarter({ status: 'rate-limited' }));

    await fillIn(user, 'ada@example.test', 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Too many attempts. Try again in a few minutes.'),
    ).toBeInTheDocument();
  });

  it('announces an unavailable service', async () => {
    const { user } = renderForm(createRecordingStarter({ status: 'unavailable' }));

    await fillIn(user, 'ada@example.test', 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Sign-in is unavailable right now. Try again.'),
    ).toBeInTheDocument();
  });

  it('keeps the typed email in place after a rejection', async () => {
    const { user } = renderForm(createRecordingStarter({ status: 'rejected' }));

    await fillIn(user, 'ada@example.test', 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Email or password is incorrect.');

    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.test');
  });

  it('clears a settled rejection as soon as the user edits a field again', async () => {
    const { user } = renderForm(createRecordingStarter({ status: 'rejected' }));

    await fillIn(user, 'ada@example.test', 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Email or password is incorrect.');

    await user.type(screen.getByLabelText('Password'), '!');

    await waitFor(() => {
      expect(screen.queryByText('Email or password is incorrect.')).not.toBeInTheDocument();
    });
  });

  it('shows the pending label on a disabled button while the request is in flight', async () => {
    const deferred = createDeferred();
    const { user } = renderForm({ signIn: () => deferred.promise });

    await fillIn(user, 'ada@example.test', 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();

    deferred.resolve({ status: 'rejected' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });
  });

  it('signs in from the keyboard alone', async () => {
    const attempts: Credentials[] = [];
    const { user } = renderForm(createRecordingStarter({ status: 'signed-in' }, attempts));

    await user.tab();
    await user.keyboard('ada@example.test');
    await user.tab();
    await user.keyboard('correct horse');
    await user.tab();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(attempts).toStrictEqual([{ email: 'ada@example.test', password: 'correct horse' }]);
    });
  });
});
