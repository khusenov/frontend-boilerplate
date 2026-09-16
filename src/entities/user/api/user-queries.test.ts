import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { toHttpError } from '@/shared/api';
import { parseStubResponse } from '@/shared/testing';

import { toUserId } from '../model/user';

import { createUserQueries, userQueryKeys } from './user-queries';
import type { UserReadClient } from './user-queries';

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';
const ADA_RESOURCE_PATH = `/users/${ADA_ID}`;

const adaPayload = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-03-09T08:15:00.000Z',
};

function createReadClient(payload: unknown, expectedPath: string): UserReadClient {
  return {
    get: async (url, config) => {
      if (url !== expectedPath) {
        throw toHttpError(new Error(`expected a request to ${expectedPath}, received ${url}`));
      }

      return parseStubResponse(config.schema, payload);
    },
  };
}

function fetchUser(client: UserReadClient, userId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return queryClient.fetchQuery(createUserQueries(client).detail(toUserId(userId)));
}

describe('userQueryKeys', () => {
  it('keys every user query under one root', () => {
    expect(userQueryKeys.all()).toStrictEqual(['users']);
  });

  it('nests the detail key under the root so invalidating the root reaches it', () => {
    const detail = userQueryKeys.detail(toUserId(ADA_ID));
    const root = userQueryKeys.all();

    expect(detail).toStrictEqual(['users', 'detail', ADA_ID]);
    expect(detail.slice(0, root.length)).toStrictEqual(root);
  });
});

describe('createUserQueries', () => {
  it('requests the user by id and resolves the mapped domain model', async () => {
    const client = createReadClient(adaPayload, ADA_RESOURCE_PATH);

    await expect(fetchUser(client, ADA_ID)).resolves.toStrictEqual({
      id: ADA_ID,
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      status: 'active',
      joinedAt: new Date('2024-01-05T12:00:00.000Z'),
    });
  });

  it('percent-encodes a slash so a crafted id cannot leave the users path', async () => {
    const client = createReadClient(adaPayload, '/users/..%2Fadmin');

    await expect(fetchUser(client, '../admin')).resolves.toMatchObject({ id: ADA_ID });
  });

  it('refuses a dot segment identifier, which encoding alone would not contain', async () => {
    const client = createReadClient(adaPayload, ADA_RESOURCE_PATH);

    await expect(fetchUser(client, '..')).rejects.toThrow('dot segment');
    await expect(fetchUser(client, '..')).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('rejects an identifier that is not a UUID', async () => {
    const client = createReadClient({ ...adaPayload, id: 'not-a-uuid' }, ADA_RESOURCE_PATH);

    await expect(fetchUser(client, ADA_ID)).rejects.toMatchObject({
      kind: 'validation',
      issues: [{ path: 'id' }],
    });
  });

  it('rejects a status the dto schema does not accept', async () => {
    const client = createReadClient({ ...adaPayload, status: 'suspended' }, ADA_RESOURCE_PATH);

    await expect(fetchUser(client, ADA_ID)).rejects.toMatchObject({
      kind: 'validation',
      issues: [{ path: 'status' }],
    });
  });

  it('rejects an email the dto schema does not accept', async () => {
    const client = createReadClient({ ...adaPayload, email: 'not-an-email' }, ADA_RESOURCE_PATH);

    await expect(fetchUser(client, ADA_ID)).rejects.toMatchObject({
      kind: 'validation',
      issues: [{ path: 'email' }],
    });
  });

  it('rejects a timestamp the dto schema does not accept', async () => {
    const client = createReadClient({ ...adaPayload, createdAt: 'yesterday' }, ADA_RESOURCE_PATH);

    await expect(fetchUser(client, ADA_ID)).rejects.toMatchObject({
      kind: 'validation',
      issues: [{ path: 'createdAt' }],
    });
  });
});
