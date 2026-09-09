import { describe, expect, it } from 'vitest';

import { HttpError } from '@/shared/api';
import type { HttpErrorKind } from '@/shared/api';

import { createSessionApi } from './session-api';
import type { SessionWriteClient } from './session-api';
import { refreshSessionResponseDtoSchema, signInResponseDtoSchema } from './session-dto';

interface RecordedCall {
  readonly url: string;
  readonly body: unknown;
  readonly schema: unknown;
}

const REFRESH_PATH = '/auth/refresh';
const SIGN_IN_PATH = '/auth/login';

const credentials = { email: 'ada@example.com', password: 'correct horse' };

function createRespondingClient(
  payload: unknown,
  calls: RecordedCall[],
  failurePath: string = REFRESH_PATH,
): SessionWriteClient {
  return {
    post: async (url, config) => {
      calls.push({ url, body: config.body, schema: config.schema });

      const result = await config.schema['~standard'].validate(payload);

      if (result.issues !== undefined) {
        throw toHttpFailure('validation', 200, failurePath);
      }

      return result.value;
    },
  };
}

function createFailingClient(error: Error): SessionWriteClient {
  return { post: () => Promise.reject(error) };
}

function toHttpFailure(kind: HttpErrorKind, status: number, url: string = REFRESH_PATH): HttpError {
  return new HttpError(
    `the ${url} exchange failed`,
    { kind, status, method: 'POST', url, payload: null, issues: [] },
    null,
  );
}

describe('createSessionApi.refresh', () => {
  it('posts an empty json body and the response schema to the refresh endpoint', async () => {
    const calls: RecordedCall[] = [];
    const api = createSessionApi(createRespondingClient({ accessToken: 'abc' }, calls));

    await api.refresh();

    expect(calls).toStrictEqual([
      { url: REFRESH_PATH, body: {}, schema: refreshSessionResponseDtoSchema },
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

  it('reports an unavailable renewal when the response carries an empty token', async () => {
    const api = createSessionApi(createRespondingClient({ accessToken: '' }, []));

    await expect(api.refresh()).resolves.toStrictEqual({ status: 'unavailable' });
  });

  it('rethrows a failure that is not a transport outcome', async () => {
    const api = createSessionApi(createFailingClient(new Error('the mapper is broken')));

    await expect(api.refresh()).rejects.toThrow('the mapper is broken');
  });
});

describe('createSessionApi.signIn', () => {
  it('posts the normalised credentials and the response schema to the sign-in endpoint', async () => {
    const calls: RecordedCall[] = [];
    const api = createSessionApi(createRespondingClient({ accessToken: 'issued-token' }, calls));

    await api.signIn({ email: '  Ada@Example.COM ', password: '  correct horse  ' });

    expect(calls).toStrictEqual([
      {
        url: SIGN_IN_PATH,
        body: { email: 'ada@example.com', password: '  correct horse  ' },
        schema: signInResponseDtoSchema,
      },
    ]);
  });

  it('reports the issued token when the server accepts the credentials', async () => {
    const api = createSessionApi(createRespondingClient({ accessToken: 'issued-token' }, []));

    await expect(api.signIn(credentials)).resolves.toStrictEqual({
      status: 'signed-in',
      accessToken: 'issued-token',
    });
  });

  it('reports rejected credentials when the server answers with a 401', async () => {
    const api = createSessionApi(createFailingClient(toHttpFailure('client', 401, SIGN_IN_PATH)));

    await expect(api.signIn(credentials)).resolves.toStrictEqual({ status: 'rejected' });
  });

  it('reports a rate limited attempt when the server answers with a 429', async () => {
    const api = createSessionApi(createFailingClient(toHttpFailure('client', 429, SIGN_IN_PATH)));

    await expect(api.signIn(credentials)).resolves.toStrictEqual({ status: 'rate-limited' });
  });

  it('reports an unavailable attempt when the backend fails', async () => {
    const api = createSessionApi(createFailingClient(toHttpFailure('server', 500, SIGN_IN_PATH)));

    await expect(api.signIn(credentials)).resolves.toStrictEqual({ status: 'unavailable' });
  });

  it('reports an unavailable attempt when the response omits the token', async () => {
    const api = createSessionApi(
      createRespondingClient({ token: 'issued-token' }, [], SIGN_IN_PATH),
    );

    await expect(api.signIn(credentials)).resolves.toStrictEqual({ status: 'unavailable' });
  });

  it('reports an unavailable attempt when the response carries an empty token', async () => {
    const api = createSessionApi(createRespondingClient({ accessToken: '' }, [], SIGN_IN_PATH));

    await expect(api.signIn(credentials)).resolves.toStrictEqual({ status: 'unavailable' });
  });

  it('rethrows a failure that is not a transport outcome', async () => {
    const api = createSessionApi(createFailingClient(new Error('the mapper is broken')));

    await expect(api.signIn(credentials)).rejects.toThrow('the mapper is broken');
  });
});
