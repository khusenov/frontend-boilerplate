import { queryOptions } from '@tanstack/react-query';

import type { HttpClient } from '@/shared/api';

import type { User, UserId } from '../model/user';

import { userDtoSchema } from './user-dto';
import { toUser } from './user-mapper';
import { userResourcePath } from './user-resource-path';

const USERS_QUERY_SCOPE = 'users';
const ALL_USERS_KEY = [USERS_QUERY_SCOPE] as const;

export type UserReadClient = Pick<HttpClient, 'get'>;

export const userQueryKeys = {
  all: () => ALL_USERS_KEY,
  detail: (userId: UserId) => [...ALL_USERS_KEY, 'detail', userId] as const,
};

export function createUserQueries(httpClient: UserReadClient) {
  return {
    detail: (userId: UserId) =>
      queryOptions({
        queryKey: userQueryKeys.detail(userId),
        queryFn: async ({ signal }): Promise<User> => {
          const dto = await httpClient.get(userResourcePath(userId), {
            schema: userDtoSchema,
            signal,
          });

          return toUser(dto);
        },
      }),
  };
}
