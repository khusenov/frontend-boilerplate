// @vitest-environment node
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAuthenticatedTransport } from './create-authenticated-transport';

const BASE_URL = 'https://api.test';
const PROTECTED_PATH = '/me';
const REFRESH_PATH = '/auth/refresh';
const SIGN_IN_PATH = '/auth/login';

const okSchema = z.object({ ok: z.boolean() });

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

interface RefreshExchange {
  readonly contentType: string | null;
  readonly body: unknown;
}

function unauthorizeFirstRequest(sentCredentials: (string | null)[]) {
  return http.get(`${BASE_URL}${PROTECTED_PATH}`, ({ request }) => {
    sentCredentials.push(request.headers.get('authorization'));

    return sentCredentials.length === 1
      ? new HttpResponse(null, { status: 401 })
      : HttpResponse.json({ ok: true });
  });
}

function unauthorizeEveryRequest(sentCredentials: (string | null)[]) {
  return http.get(`${BASE_URL}${PROTECTED_PATH}`, ({ request }) => {
    sentCredentials.push(request.headers.get('authorization'));

    return new HttpResponse(null, { status: 401 });
  });
}

function renewInto(exchanges: RefreshExchange[]) {
  return http.post(`${BASE_URL}${REFRESH_PATH}`, async ({ request }) => {
    exchanges.push({
      contentType: request.headers.get('content-type'),
      body: await request.json(),
    });

    return HttpResponse.json({ accessToken: 'fresh-token' });
  });
}

function refuseRenewal(exchanges: RefreshExchange[]) {
  return http.post(`${BASE_URL}${REFRESH_PATH}`, async ({ request }) => {
    exchanges.push({
      contentType: request.headers.get('content-type'),
      body: await request.json(),
    });

    return new HttpResponse(null, { status: 401 });
  });
}

interface SignInExchange {
  readonly body: unknown;
}

function issueTokenTo(exchanges: SignInExchange[]) {
  return http.post(`${BASE_URL}${SIGN_IN_PATH}`, async ({ request }) => {
    exchanges.push({ body: await request.json() });

    return HttpResponse.json({ accessToken: 'issued-token' });
  });
}

function acceptEveryRequest(sentCredentials: (string | null)[]) {
  return http.get(`${BASE_URL}${PROTECTED_PATH}`, ({ request }) => {
    sentCredentials.push(request.headers.get('authorization'));

    return HttpResponse.json({ ok: true });
  });
}

describe('createAuthenticatedTransport', () => {
  it('renews on a 401 and replays the request with the new bearer token', async () => {
    const sentCredentials: (string | null)[] = [];
    const exchanges: RefreshExchange[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials), renewInto(exchanges));
    const { httpClient } = createAuthenticatedTransport(BASE_URL);

    await expect(httpClient.get(PROTECTED_PATH, { schema: okSchema })).resolves.toStrictEqual({
      ok: true,
    });
    expect(sentCredentials).toStrictEqual([null, 'Bearer fresh-token']);
    expect(exchanges).toHaveLength(1);
  });

  it('sends the refresh request with a json body the backend will parse', async () => {
    const sentCredentials: (string | null)[] = [];
    const exchanges: RefreshExchange[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials), renewInto(exchanges));
    const { httpClient } = createAuthenticatedTransport(BASE_URL);

    await httpClient.get(PROTECTED_PATH, { schema: okSchema });

    expect(exchanges).toStrictEqual([{ contentType: 'application/json', body: {} }]);
  });

  it('does not recurse when the refresh endpoint answers with a 401', async () => {
    const sentCredentials: (string | null)[] = [];
    const exchanges: RefreshExchange[] = [];
    server.use(unauthorizeEveryRequest(sentCredentials), refuseRenewal(exchanges));
    const { httpClient } = createAuthenticatedTransport(BASE_URL);

    await expect(httpClient.get(PROTECTED_PATH, { schema: okSchema })).rejects.toMatchObject({
      kind: 'client',
      status: 401,
    });
    expect(exchanges).toHaveLength(1);
  });

  it('reports an anonymous session once the refresh credential is rejected', async () => {
    const sentCredentials: (string | null)[] = [];
    const exchanges: RefreshExchange[] = [];
    server.use(unauthorizeEveryRequest(sentCredentials), refuseRenewal(exchanges));
    const transport = createAuthenticatedTransport(BASE_URL);

    expect(transport.sessionObserver.status()).toBe('unknown');

    await expect(
      transport.httpClient.get(PROTECTED_PATH, { schema: okSchema }),
    ).rejects.toMatchObject({ status: 401 });

    expect(transport.sessionObserver.status()).toBe('anonymous');
  });

  it('stops renewing once the session has ended', async () => {
    const sentCredentials: (string | null)[] = [];
    const exchanges: RefreshExchange[] = [];
    server.use(unauthorizeEveryRequest(sentCredentials), refuseRenewal(exchanges));
    const { httpClient } = createAuthenticatedTransport(BASE_URL);

    await expect(httpClient.get(PROTECTED_PATH, { schema: okSchema })).rejects.toMatchObject({
      status: 401,
    });
    await expect(httpClient.get(PROTECTED_PATH, { schema: okSchema })).rejects.toMatchObject({
      status: 401,
    });

    expect(sentCredentials).toStrictEqual([null, null]);
    expect(exchanges).toHaveLength(1);
  });

  it('authenticates the session the observer reports and the transport carries', async () => {
    const sentCredentials: (string | null)[] = [];
    const exchanges: SignInExchange[] = [];
    server.use(issueTokenTo(exchanges), acceptEveryRequest(sentCredentials));
    const transport = createAuthenticatedTransport(BASE_URL);

    expect(transport.sessionObserver.status()).toBe('unknown');

    await expect(
      transport.sessionStarter.signIn({ email: 'Ada@Example.com', password: 'correct horse' }),
    ).resolves.toStrictEqual({ status: 'signed-in' });

    expect(transport.sessionObserver.status()).toBe('authenticated');

    await expect(
      transport.httpClient.get(PROTECTED_PATH, { schema: okSchema }),
    ).resolves.toStrictEqual({ ok: true });

    expect(sentCredentials).toStrictEqual(['Bearer issued-token']);
    expect(exchanges).toStrictEqual([
      { body: { email: 'ada@example.com', password: 'correct horse' } },
    ]);
  });

  it('does not attempt a renewal when the credentials are rejected', async () => {
    server.use(
      http.post(`${BASE_URL}${SIGN_IN_PATH}`, () => new HttpResponse(null, { status: 401 })),
    );
    const transport = createAuthenticatedTransport(BASE_URL);

    await expect(
      transport.sessionStarter.signIn({ email: 'ada@example.com', password: 'wrong' }),
    ).resolves.toStrictEqual({ status: 'rejected' });

    expect(transport.sessionObserver.status()).toBe('unknown');
  });
});
