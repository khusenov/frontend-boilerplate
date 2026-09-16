import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { parseStubResponse } from '@/shared/testing';

import { toUserId } from '../model/user';
import type { User } from '../model/user';

import { replaceCachedUser } from './user-cache';
import { createUserQueries, userQueryKeys } from './user-queries';
import type { UserReadClient } from './user-queries';

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';

const savedAdaKing: User = {
  id: toUserId(ADA_ID),
  firstName: 'Ada',
  lastName: 'King',
  displayName: 'Ada King',
  email: 'ada@example.test',
  status: 'active',
  joinedAt: new Date('2024-01-05T12:00:00.000Z'),
};

const cachedAdaLovelace: User = {
  ...savedAdaKing,
  lastName: 'Lovelace',
  displayName: 'Ada Lovelace',
};

const adaLovelacePayload = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-01-05T12:00:00.000Z',
};

interface StalledReadClient {
  readonly client: UserReadClient;
  readonly deliverResponse: (body: unknown) => void;
}

function createStalledReadClient(): StalledReadClient {
  let deliverResponse!: (body: unknown) => void;
  const response = new Promise<unknown>((resolveResponse) => {
    deliverResponse = resolveResponse;
  });

  return {
    client: {
      get: async (_url, config) => parseStubResponse(config.schema, await response),
    },
    deliverResponse,
  };
}

function waitForNextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('replaceCachedUser', () => {
  it('replaces the user under the id it is given, not the id the user carries', async () => {
    const queryClient = new QueryClient();
    const routeUserId = toUserId(ADA_ID.toUpperCase());
    queryClient.setQueryData(userQueryKeys.detail(routeUserId), cachedAdaLovelace);

    await replaceCachedUser(queryClient, routeUserId, savedAdaKing);

    expect(queryClient.getQueryData(userQueryKeys.detail(routeUserId))).toStrictEqual(savedAdaKing);
    expect(queryClient.getQueryData(userQueryKeys.detail(toUserId(ADA_ID)))).toBeUndefined();
  });

  it('writes nothing when the cache holds no such user, as after a sign-out cleared it', async () => {
    const queryClient = new QueryClient();
    const adaUserId = toUserId(ADA_ID);

    await replaceCachedUser(queryClient, adaUserId, savedAdaKing);

    expect(queryClient.getQueryData(userQueryKeys.detail(adaUserId))).toBeUndefined();
  });

  it('leaves a first read of the user alone, so the next visitor gets the server answer', async () => {
    const queryClient = new QueryClient();
    const adaUserId = toUserId(ADA_ID);
    const stalledRead = createStalledReadClient();
    const firstRead = queryClient.fetchQuery(
      createUserQueries(stalledRead.client).detail(adaUserId),
    );

    await replaceCachedUser(queryClient, adaUserId, savedAdaKing);
    stalledRead.deliverResponse(adaLovelacePayload);

    await expect(firstRead).resolves.toMatchObject({ displayName: 'Ada Lovelace' });
  });

  it('keeps the written user when a refetch that started earlier delivers its response later', async () => {
    const queryClient = new QueryClient();
    const adaUserId = toUserId(ADA_ID);
    queryClient.setQueryData(userQueryKeys.detail(adaUserId), cachedAdaLovelace);
    const stalledRead = createStalledReadClient();
    const staleRefetch = queryClient
      .fetchQuery(createUserQueries(stalledRead.client).detail(adaUserId))
      .catch(() => undefined);

    await replaceCachedUser(queryClient, adaUserId, savedAdaKing);
    stalledRead.deliverResponse(adaLovelacePayload);
    await staleRefetch;
    await waitForNextMacrotask();

    expect(queryClient.getQueryData(userQueryKeys.detail(adaUserId))).toStrictEqual(savedAdaKing);
  });
});
