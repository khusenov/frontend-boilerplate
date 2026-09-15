import { useMutation } from '@tanstack/react-query';

import { useSessionEnder } from '@/entities/session';

export interface UseSignOutOptions {
  readonly onSignedOut: () => void;
}

export interface UseSignOutResult {
  readonly isSigningOut: boolean;
  readonly signOut: () => Promise<void>;
}

export function useSignOut({ onSignedOut }: UseSignOutOptions): UseSignOutResult {
  const sessionEnder = useSessionEnder();
  const mutation = useMutation({
    mutationFn: () => sessionEnder.signOut(),
    // onSettled, not onSuccess: the local session is gone down every path, including a
    // rejected request, so the caller must leave down every path too.
    onSettled: () => {
      onSignedOut();
    },
  });

  return {
    isSigningOut: mutation.isPending,
    signOut: async () => {
      await mutation.mutateAsync().catch(() => undefined);
    },
  };
}
