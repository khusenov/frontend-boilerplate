import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { toHttpError } from '@/shared/api';

import { toUserId } from '../model/user';

import { createUserQueries, userQueryKeys } from './user-queries';
import type { UserReadClient } from './user-queries';

const adaPayload = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

function createReadClient(payload: unknown, expectedPath: string): UserReadClient {
  return {
    get: async (url, config) => {
      if (url !== expectedPath) {
        throw toHttpError(new Error(`expected a request to ${expectedPath}, received ${url}`));
      }

      const result = await config.schema['~standard'].validate(payload);

      if (result.issues !== undefined) {
        throw toHttpError(new Error('the payload does not satisfy the request schema'));
      }

      return result.value;
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
    const detail = userQueryKeys.detail(toUserId('u_1'));
    const root = userQueryKeys.all();

    expect(detail).toStrictEqual(['users', 'detail', 'u_1']);
    expect(detail.slice(0, root.length)).toStrictEqual(root);
  });
});

describe('createUserQueries', () => {
  it('requests the user by id and resolves the mapped domain model', async () => {
    const client = createReadClient(adaPayload, '/users/u_1');

    await expect(fetchUser(client, 'u_1')).resolves.toStrictEqual({
      id: 'u_1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      role: 'admin',
      joinedAt: new Date('2024-01-05T12:00:00.000Z'),
    });
  });

  it('percent-encodes a slash so a crafted id cannot leave the users path', async () => {
    const client = createReadClient(adaPayload, '/users/..%2Fadmin');

    await expect(fetchUser(client, '../admin')).resolves.toMatchObject({ id: 'u_1' });
  });

  it('refuses a dot segment identifier, which encoding alone would not contain', async () => {
    const client = createReadClient(adaPayload, '/users/u_1');

    await expect(fetchUser(client, '..')).rejects.toThrow('dot segment');
    await expect(fetchUser(client, '..')).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('rejects a role the dto schema does not accept', async () => {
    const client = createReadClient({ ...adaPayload, role: 'OWNER' }, '/users/u_1');

    await expect(fetchUser(client, 'u_1')).rejects.toThrow();
  });

  it('rejects an email the dto schema does not accept', async () => {
    const client = createReadClient({ ...adaPayload, email: 'not-an-email' }, '/users/u_1');

    await expect(fetchUser(client, 'u_1')).rejects.toThrow();
  });

  it('rejects a timestamp the dto schema does not accept', async () => {
    const client = createReadClient({ ...adaPayload, created_at: 'yesterday' }, '/users/u_1');

    await expect(fetchUser(client, 'u_1')).rejects.toThrow();
  });
});
