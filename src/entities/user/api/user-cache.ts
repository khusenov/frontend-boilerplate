import type { QueryClient } from '@tanstack/react-query';

import type { User, UserId } from '../model/user';

import { userQueryKeys } from './user-queries';

export type UserCacheTarget = Pick<QueryClient, 'cancelQueries' | 'getQueryData' | 'setQueryData'>;

export async function replaceCachedUser(
  cache: UserCacheTarget,
  queriedUserId: UserId,
  user: User,
): Promise<void> {
  const detailKey = userQueryKeys.detail(queriedUserId);

  if (cache.getQueryData(detailKey) === undefined) {
    return;
  }

  await cache.cancelQueries({ queryKey: detailKey });
  cache.setQueryData<User>(detailKey, user);
}
