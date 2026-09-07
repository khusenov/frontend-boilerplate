import { useMutation } from '@tanstack/react-query';

import { createUserMutations } from '@/entities/user';
import type { UserId, UserNameChange } from '@/entities/user';
import { useHttpClient } from '@/shared/api';

import { toUpdateUserNameStatus } from './update-user-name-status';
import type { UpdateUserNameStatus } from './update-user-name-status';

export interface UseUpdateUserNameResult {
  readonly status: UpdateUserNameStatus;
  readonly submit: (change: UserNameChange) => Promise<void>;
  readonly dismissOutcome: () => void;
}

export function useUpdateUserName(userId: UserId): UseUpdateUserNameResult {
  const httpClient = useHttpClient();
  const mutation = useMutation(createUserMutations(httpClient).updateName(userId));
  const status = toUpdateUserNameStatus(mutation.status);

  return {
    status,
    submit: async (change) => {
      await mutation.mutateAsync(change).catch(() => undefined);
    },
    dismissOutcome: () => {
      if (status === 'saved' || status === 'failed') {
        mutation.reset();
      }
    },
  };
}
