import { useQuery } from '@tanstack/react-query';

import { createUserQueries } from '@/entities/user';
import type { User, UserId } from '@/entities/user';
import { useHttpClient } from '@/shared/api';

export type UserProfileState =
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly user: User };

export function useUserProfile(userId: UserId): UserProfileState {
  const httpClient = useHttpClient();
  const userQuery = useQuery(createUserQueries(httpClient).detail(userId));

  if (userQuery.isPending) {
    return { status: 'pending' };
  }

  if (userQuery.isError) {
    return { status: 'unavailable' };
  }

  return { status: 'ready', user: userQuery.data };
}
