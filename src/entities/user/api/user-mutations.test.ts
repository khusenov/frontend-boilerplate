import { QueryClient } from '@tanstack/react-query';
import type { MutationFunctionContext } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { toHttpError } from '@/shared/api';

import { toUserId } from '../model/user';
import type { UserNameChange } from '../model/user';

import { createUserMutations } from './user-mutations';
import type { UserWriteClient } from './user-mutations';

interface RecordedRequest {
  readonly url: string;
  readonly body: unknown;
}

const ada: UserNameChange = { firstName: 'Ada', lastName: 'King' };

function createWriteClient(responseBody: unknown, requests: RecordedRequest[]): UserWriteClient {
  return {
    patch: async (url, config) => {
      requests.push({ url, body: config.body });

      const result = await config.schema['~standard'].validate(responseBody);

      if (result.issues !== undefined) {
        throw toHttpError(new Error('the response does not satisfy the request schema'));
      }

      return result.value;
    },
  };
}

function updateName(client: UserWriteClient, userId: string) {
  const { mutationFn, onSuccess } = createUserMutations(client).updateName(toUserId(userId));

  if (mutationFn === undefined || onSuccess === undefined) {
    throw new Error('createUserMutations must supply both a mutationFn and an onSuccess handler.');
  }

  return { mutationFn, onSuccess };
}

function toMutationContext(client: QueryClient): MutationFunctionContext {
  return { client, meta: undefined };
}

describe('createUserMutations', () => {
  it('patches the user by id with the snake_case payload', async () => {
    const requests: RecordedRequest[] = [];
    const { mutationFn } = updateName(createWriteClient(null, requests), 'u_1');

    await mutationFn(ada, toMutationContext(new QueryClient()));

    expect(requests).toStrictEqual([
      { url: '/users/u_1', body: { first_name: 'Ada', last_name: 'King' } },
    ]);
  });

  it('sends the trimmed name the schema validated', async () => {
    const requests: RecordedRequest[] = [];
    const { mutationFn } = updateName(createWriteClient(null, requests), 'u_1');

    await mutationFn(
      { firstName: '  Ada  ', lastName: '  King  ' },
      toMutationContext(new QueryClient()),
    );

    expect(requests).toStrictEqual([
      { url: '/users/u_1', body: { first_name: 'Ada', last_name: 'King' } },
    ]);
  });

  it('percent-encodes a slash so a crafted id cannot leave the users path', async () => {
    const requests: RecordedRequest[] = [];
    const { mutationFn } = updateName(createWriteClient(null, requests), '../admin');

    await mutationFn(ada, toMutationContext(new QueryClient()));

    expect(requests[0]?.url).toBe('/users/..%2Fadmin');
  });

  it('rejects a dot segment identifier, which encoding alone would not contain', async () => {
    const requests: RecordedRequest[] = [];
    const { mutationFn } = updateName(createWriteClient(null, requests), '..');
    const rejection = mutationFn(ada, toMutationContext(new QueryClient()));

    await expect(rejection).rejects.toThrow('dot segment');
    await expect(rejection).rejects.toMatchObject({ kind: 'unknown' });
    expect(requests).toStrictEqual([]);
  });

  it('resolves null when the endpoint answers with an empty body', async () => {
    const { mutationFn } = updateName(createWriteClient('', []), 'u_1');

    await expect(mutationFn(ada, toMutationContext(new QueryClient()))).resolves.toBeNull();
  });

  it('rejects when the endpoint answers with a body, proving the 204 contract is enforced', async () => {
    const { mutationFn } = updateName(createWriteClient({ id: 'u_1' }, []), 'u_1');

    await expect(mutationFn(ada, toMutationContext(new QueryClient()))).rejects.toThrow();
  });

  it('invalidates the renamed user detail query on success', async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { onSuccess } = updateName(createWriteClient(null, []), 'u_1');

    await onSuccess(null, ada, undefined, toMutationContext(queryClient));

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users', 'detail', 'u_1'] });
  });
});
