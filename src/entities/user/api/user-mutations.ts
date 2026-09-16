import { mutationOptions } from '@tanstack/react-query';

import type { HttpClient } from '@/shared/api';

import type { User, UserId, UserNameChange } from '../model/user';

import { replaceCachedUser } from './user-cache';
import { userDtoSchema } from './user-dto';
import { toUpdateUserNameRequestDto, toUser } from './user-mapper';
import { userResourcePath } from './user-resource-path';

export type UserWriteClient = Pick<HttpClient, 'patch'>;

export function createUserMutations(httpClient: UserWriteClient) {
  return {
    updateName: (userId: UserId) =>
      mutationOptions({
        mutationFn: async (change: UserNameChange, { client }): Promise<User> => {
          const dto = await httpClient.patch(userResourcePath(userId), {
            body: toUpdateUserNameRequestDto(change),
            schema: userDtoSchema,
          });
          const savedUser = toUser(dto);

          await replaceCachedUser(client, userId, savedUser);

          return savedUser;
        },
      }),
  };
}
