import { mutationOptions } from '@tanstack/react-query';

import { noContentSchema } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import type { UserId, UserNameChange } from '../model/user';

import { toUpdateUserNameDto } from './user-mapper';
import { userQueryKeys } from './user-queries';
import { userResourcePath } from './user-resource-path';

export type UserWriteClient = Pick<HttpClient, 'patch'>;

export function createUserMutations(httpClient: UserWriteClient) {
  return {
    updateName: (userId: UserId) =>
      mutationOptions({
        mutationFn: async (change: UserNameChange): Promise<null> =>
          httpClient.patch(userResourcePath(userId), {
            body: toUpdateUserNameDto(change),
            schema: noContentSchema,
          }),
        onSuccess: (_data, _change, _onMutateResult, { client }) =>
          client.invalidateQueries({ queryKey: userQueryKeys.detail(userId) }),
      }),
  };
}
