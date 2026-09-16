import { describe, expect, it } from 'vitest';

import { isHttpError, noContentSchema, toHttpError } from '@/shared/api';

import { createHttpClientStub } from './create-http-client-stub';

describe('the http client stub', () => {
  it('rejects every verb that the test did not stub', async () => {
    const client = createHttpClientStub();

    const rejections = await Promise.all(
      [
        client.get('/anything', { schema: noContentSchema }),
        client.post('/anything', { schema: noContentSchema }),
        client.put('/anything', { schema: noContentSchema }),
        client.patch('/anything', { schema: noContentSchema }),
        client.delete('/anything', { schema: noContentSchema }),
      ].map((pending) => pending.then(() => null).catch((error: unknown) => error)),
    );

    expect(rejections).toHaveLength(5);

    for (const rejection of rejections) {
      expect(isHttpError(rejection)).toBe(true);
    }
  });

  it('names the verb that was not expected', async () => {
    const client = createHttpClientStub();

    await expect(client.post('/anything', { schema: noContentSchema })).rejects.toThrow(
      /unexpected POST request/,
    );
  });

  it('uses the override for a stubbed verb and keeps the rest rejecting', async () => {
    const client = createHttpClientStub({
      get: async (_url, config) => {
        const result = await config.schema['~standard'].validate(null);

        if (result.issues !== undefined) {
          throw toHttpError(new Error('the response does not satisfy the request schema'));
        }

        return result.value;
      },
    });

    await expect(client.get('/anything', { schema: noContentSchema })).resolves.toBeNull();
    await expect(client.delete('/anything', { schema: noContentSchema })).rejects.toThrow(
      /unexpected DELETE request/,
    );
  });
});
