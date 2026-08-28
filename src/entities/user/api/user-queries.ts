import { queryOptions } from '@tanstack/react-query';

import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import type { User, UserId } from '../model/user';

import { userDtoSchema } from './user-dto';
import { toUser } from './user-mapper';

const USERS_SCOPE = 'users';
const USERS_RESOURCE_PATH = `/${USERS_SCOPE}`;
const ALL_USERS_KEY = [USERS_SCOPE] as const;
const UNUSABLE_IDENTIFIER_SEGMENTS: readonly string[] = ['', '.', '..'];

export type UserReadClient = Pick<HttpClient, 'get'>;

function toPathSegment(userId: UserId): string {
  if (UNUSABLE_IDENTIFIER_SEGMENTS.includes(userId)) {
    throw toHttpError(new Error('A user identifier may not be empty or a dot segment.'));
  }

  return encodeURIComponent(userId);
}

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
          const path = `${USERS_RESOURCE_PATH}/${toPathSegment(userId)}`;
          const dto = await httpClient.get(path, { schema: userDtoSchema, signal });

          return toUser(dto);
        },
      }),
  };
}
