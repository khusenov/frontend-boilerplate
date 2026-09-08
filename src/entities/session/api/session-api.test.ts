import { describe, expect, it } from 'vitest';

import { HttpError } from '@/shared/api';
import type { HttpErrorKind } from '@/shared/api';

import { createSessionApi } from './session-api';
import type { SessionWriteClient } from './session-api';
import { refreshSessionResponseDtoSchema } from './session-dto';

interface RecordedCall {
  readonly url: string;
  readonly body: unknown;
  readonly schema: unknown;
}

function createRespondingClient(payload: unknown, calls: RecordedCall[]): SessionWriteClient {
  return {
    post: async (url, config) => {
      calls.push({ url, body: config.body, schema: config.schema });

      const result = await config.schema['~standard'].validate(payload);

      if (result.issues !== undefined) {
        throw toHttpFailure('validation', 200);
      }

      return result.value;
    },
  };
}

function createFailingClient(error: Error): SessionWriteClient {
  return { post: () => Promise.reject(error) };
}

function toHttpFailure(kind: HttpErrorKind, status: number): HttpError {
  return new HttpError(
    'the refresh exchange failed',
    { kind, status, method: 'POST', url: '/auth/refresh', payload: null, issues: [] },
    null,
  );
}

describe('createSessionApi', () => {
  it('posts an empty json body and the response schema to the refresh endpoint', async () => {
    const calls: RecordedCall[] = [];
    const api = createSessionApi(createRespondingClient({ accessToken: 'abc' }, calls));

    await api.refresh();

    expect(calls).toStrictEqual([
      { url: '/auth/refresh', body: {}, schema: refreshSessionResponseDtoSchema },
    ]);
  });

  it('reports a renewed session when the endpoint returns an access token', async () => {
    const api = createSessionApi(createRespondingClient({ accessToken: 'abc' }, []));

    await expect(api.refresh()).resolves.toStrictEqual({ status: 'refreshed', accessToken: 'abc' });
  });

  it('reports an expired session when the refresh credential is rejected', async () => {
    const api = createSessionApi(createFailingClient(toHttpFailure('client', 401)));

    await expect(api.refresh()).resolves.toStrictEqual({ status: 'expired' });
  });

  it('reports an unavailable renewal when the backend fails', async () => {
    const api = createSessionApi(createFailingClient(toHttpFailure('server', 500)));

    await expect(api.refresh()).resolves.toStrictEqual({ status: 'unavailable' });
  });

  it('reports an unavailable renewal when the response does not match the schema', async () => {
    const api = createSessionApi(createRespondingClient({ token: 'abc' }, []));

    await expect(api.refresh()).resolves.toStrictEqual({ status: 'unavailable' });
  });

  it('rethrows a failure that is not a transport outcome', async () => {
    const api = createSessionApi(createFailingClient(new Error('the mapper is broken')));

    await expect(api.refresh()).rejects.toThrow('the mapper is broken');
  });
});
