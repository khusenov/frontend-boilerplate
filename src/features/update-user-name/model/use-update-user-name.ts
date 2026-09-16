import { useMutation } from '@tanstack/react-query';

import { createUserMutations } from '@/entities/user';
import type { UserId, UserNameChange } from '@/entities/user';
import { useHttpClient } from '@/shared/api';
import { useNotifier } from '@/shared/notifications';

import { toUpdateUserNameStatus } from './update-user-name-status';
import type { UpdateUserNameStatus } from './update-user-name-status';

export interface UseUpdateUserNameOptions {
  readonly savedMessage: string;
}

export interface UseUpdateUserNameResult {
  readonly status: UpdateUserNameStatus;
  readonly submit: (change: UserNameChange) => Promise<void>;
  readonly dismissOutcome: () => void;
}

export function useUpdateUserName(
  userId: UserId,
  { savedMessage }: UseUpdateUserNameOptions,
): UseUpdateUserNameResult {
  const httpClient = useHttpClient();
  const notify = useNotifier();
  const mutation = useMutation(createUserMutations(httpClient).updateName(userId));
  const status = toUpdateUserNameStatus(mutation.status);

  return {
    status,
    submit: async (change) => {
      try {
        await mutation.mutateAsync(change);
      } catch {
        return;
      }

      notify({ message: savedMessage });
    },
    dismissOutcome: () => {
      if (status === 'saved' || status === 'failed') {
        mutation.reset();
      }
    },
  };
}
