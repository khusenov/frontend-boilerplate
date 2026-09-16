import { MutationObserver, QueryClient } from '@tanstack/react-query';
import type { MutationFunctionContext } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { parseStubResponse } from '@/shared/testing';

import { toUserId } from '../model/user';
import type { User, UserNameChange } from '../model/user';

import { createUserMutations } from './user-mutations';
import type { UserWriteClient } from './user-mutations';
import { userQueryKeys } from './user-queries';

interface RecordedRequest {
  readonly url: string;
  readonly body: unknown;
}

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';
const ADA_RESOURCE_PATH = `/users/${ADA_ID}`;

const renameToAdaKing: UserNameChange = { firstName: 'Ada', lastName: 'King' };

const savedAdaKingPayload = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'King',
  fullName: 'Ada King',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-03-09T08:15:00.000Z',
};

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

function createWriteClient(responseBody: unknown, requests: RecordedRequest[]): UserWriteClient {
  return {
    patch: async (url, config) => {
      requests.push({ url, body: config.body });

      return parseStubResponse(config.schema, responseBody);
    },
  };
}

function requireUpdateNameFn(client: UserWriteClient, userId: string) {
  const { mutationFn } = createUserMutations(client).updateName(toUserId(userId));

  if (mutationFn === undefined) {
    throw new Error('createUserMutations must supply a mutationFn for updateName.');
  }

  return mutationFn;
}

function toMutationContext(client: QueryClient): MutationFunctionContext {
  return { client, meta: undefined };
}

describe('createUserMutations', () => {
  it('patches the user by id with the camelCase name payload', async () => {
    const requests: RecordedRequest[] = [];
    const updateName = requireUpdateNameFn(
      createWriteClient(savedAdaKingPayload, requests),
      ADA_ID,
    );

    await updateName(renameToAdaKing, toMutationContext(new QueryClient()));

    expect(requests).toStrictEqual([
      { url: ADA_RESOURCE_PATH, body: { firstName: 'Ada', lastName: 'King' } },
    ]);
  });

  it('sends the trimmed name the schema validated', async () => {
    const requests: RecordedRequest[] = [];
    const updateName = requireUpdateNameFn(
      createWriteClient(savedAdaKingPayload, requests),
      ADA_ID,
    );

    await updateName(
      { firstName: '  Ada  ', lastName: '  King  ' },
      toMutationContext(new QueryClient()),
    );

    expect(requests).toStrictEqual([
      { url: ADA_RESOURCE_PATH, body: { firstName: 'Ada', lastName: 'King' } },
    ]);
  });

  it('percent-encodes a slash so a crafted id cannot leave the users path', async () => {
    const requests: RecordedRequest[] = [];
    const updateName = requireUpdateNameFn(
      createWriteClient(savedAdaKingPayload, requests),
      '../admin',
    );

    await updateName(renameToAdaKing, toMutationContext(new QueryClient()));

    expect(requests[0]?.url).toBe('/users/..%2Fadmin');
  });

  it('rejects a dot segment identifier, which encoding alone would not contain', async () => {
    const requests: RecordedRequest[] = [];
    const updateName = requireUpdateNameFn(createWriteClient(savedAdaKingPayload, requests), '..');
    const rejection = updateName(renameToAdaKing, toMutationContext(new QueryClient()));

    await expect(rejection).rejects.toThrow('dot segment');
    await expect(rejection).rejects.toMatchObject({ kind: 'unknown' });
    expect(requests).toStrictEqual([]);
  });

  it('resolves the saved user the endpoint returned, mapped into the domain', async () => {
    const updateName = requireUpdateNameFn(createWriteClient(savedAdaKingPayload, []), ADA_ID);

    await expect(
      updateName(renameToAdaKing, toMutationContext(new QueryClient())),
    ).resolves.toStrictEqual(savedAdaKing);
  });

  it('rejects an empty body at the response schema and keeps the cached user', async () => {
    const queryClient = new QueryClient();
    const adaUserId = toUserId(ADA_ID);
    queryClient.setQueryData(userQueryKeys.detail(adaUserId), cachedAdaLovelace);
    const updateName = requireUpdateNameFn(createWriteClient('', []), ADA_ID);

    await expect(updateName(renameToAdaKing, toMutationContext(queryClient))).rejects.toMatchObject(
      { kind: 'validation' },
    );
    expect(queryClient.getQueryData(userQueryKeys.detail(adaUserId))).toStrictEqual(
      cachedAdaLovelace,
    );
  });

  it('replaces the cached user under the id the page queried with, not the canonical one', async () => {
    const queryClient = new QueryClient();
    const routeUserId = ADA_ID.toUpperCase();
    queryClient.setQueryData(userQueryKeys.detail(toUserId(routeUserId)), cachedAdaLovelace);
    const updateName = requireUpdateNameFn(createWriteClient(savedAdaKingPayload, []), routeUserId);

    await updateName(renameToAdaKing, toMutationContext(queryClient));

    expect(queryClient.getQueryData(userQueryKeys.detail(toUserId(routeUserId)))).toStrictEqual(
      savedAdaKing,
    );
  });

  it('keeps the cache write when a consumer supplies its own onSuccess', async () => {
    const queryClient = new QueryClient();
    const adaUserId = toUserId(ADA_ID);
    queryClient.setQueryData(userQueryKeys.detail(adaUserId), cachedAdaLovelace);
    const options = createUserMutations(createWriteClient(savedAdaKingPayload, [])).updateName(
      adaUserId,
    );
    const observer = new MutationObserver(queryClient, { ...options, onSuccess: () => undefined });

    await observer.mutate(renameToAdaKing);

    expect(queryClient.getQueryData(userQueryKeys.detail(adaUserId))).toStrictEqual(savedAdaKing);
  });
});
