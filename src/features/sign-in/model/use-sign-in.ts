import { useMutation } from '@tanstack/react-query';

import { useSessionStarter } from '@/entities/session';
import type { Credentials, SignInOutcome } from '@/entities/session';

import { isDismissible, toSignInStatus } from './sign-in-status';
import type { SignInStatus } from './sign-in-status';

export interface UseSignInOptions {
  readonly onSignedIn: () => void;
}

export interface UseSignInResult {
  readonly status: SignInStatus;
  readonly submit: (credentials: Credentials) => Promise<void>;
  readonly dismissOutcome: () => void;
}

export function useSignIn({ onSignedIn }: UseSignInOptions): UseSignInResult {
  const sessionStarter = useSessionStarter();
  const mutation = useMutation({
    // state.variables holds the plaintext password and no reducer clears it:
    // this cache entry must not outlive the form.
    gcTime: 0,
    mutationFn: (credentials: Credentials): Promise<SignInOutcome> =>
      sessionStarter.signIn(credentials),
    onSuccess: (outcome) => {
      if (outcome.status === 'signed-in') {
        onSignedIn();
      }
    },
  });
  const status = toSignInStatus(mutation.status, mutation.data);

  return {
    status,
    submit: async (credentials) => {
      await mutation.mutateAsync(credentials).catch(() => undefined);
    },
    dismissOutcome: () => {
      if (isDismissible(status)) {
        mutation.reset();
      }
    },
  };
}
