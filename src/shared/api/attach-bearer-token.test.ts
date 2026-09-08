// @vitest-environment node
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { attachBearerToken } from './attach-bearer-token';
import type { BearerTokenSource } from './bearer-token-source';
import { createHttpClient } from './http-client';
import { isHttpError } from './http-error';

const BASE_URL = 'https://api.test';
const PROTECTED_PATH = '/me';

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

function createSourceStub(
  getToken: () => string | null,
  renewToken: (staleToken: string | null) => Promise<string | null>,
) {
  const renewTokenSpy = vi.fn(renewToken);
  const source: BearerTokenSource = { getToken, renewToken: renewTokenSpy };

  return { source, renewTokenSpy };
}

function neverRenews(): Promise<string | null> {
  return Promise.resolve(null);
}

function recordAuthorization(sentCredentials: (string | null)[]) {
  return http.get(`${BASE_URL}${PROTECTED_PATH}`, ({ request }) => {
    sentCredentials.push(request.headers.get('authorization'));

    return HttpResponse.json({ ok: true });
  });
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

function unauthorizeUntilTheThirdRequest(sentCredentials: (string | null)[]) {
  return http.get(`${BASE_URL}${PROTECTED_PATH}`, ({ request }) => {
    sentCredentials.push(request.headers.get('authorization'));

    return sentCredentials.length > 2
      ? HttpResponse.json({ ok: true })
      : new HttpResponse(null, { status: 401 });
  });
}

describe('attachBearerToken', () => {
  it('sends the token the source holds as a bearer credential', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(recordAuthorization(sentCredentials));
    const { source } = createSourceStub(() => 'token-1', neverRenews);
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await expect(client.get(PROTECTED_PATH, { schema: okSchema })).resolves.toStrictEqual({
      ok: true,
    });
    expect(sentCredentials).toStrictEqual(['Bearer token-1']);
  });

  it('sends no authorization header when the source holds no token', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(recordAuthorization(sentCredentials));
    const { source } = createSourceStub(() => null, neverRenews);
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await expect(client.get(PROTECTED_PATH, { schema: okSchema })).resolves.toStrictEqual({
      ok: true,
    });
    expect(sentCredentials).toStrictEqual([null]);
  });

  it('overrides a caller supplied authorization header with the source token', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(recordAuthorization(sentCredentials));
    const { source } = createSourceStub(() => 'source-token', neverRenews);
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await client.get(PROTECTED_PATH, {
      schema: okSchema,
      headers: { Authorization: 'Bearer caller-token' },
    });

    expect(sentCredentials).toStrictEqual(['Bearer source-token']);
  });

  it('registers the bearer interceptor before error normalization', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials));
    let token: string | null = 'stale-token';
    const { source } = createSourceStub(
      () => token,
      () => {
        token = 'fresh-token';

        return Promise.resolve(token);
      },
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await expect(client.get(PROTECTED_PATH, { schema: okSchema })).resolves.toStrictEqual({
      ok: true,
    });
  });

  it('renews once on a 401 and replays the request with the new token', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials));
    let token: string | null = 'stale-token';
    const { source, renewTokenSpy } = createSourceStub(
      () => token,
      () => {
        token = 'fresh-token';

        return Promise.resolve(token);
      },
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await client.get(PROTECTED_PATH, { schema: okSchema });

    expect(sentCredentials).toStrictEqual(['Bearer stale-token', 'Bearer fresh-token']);
    expect(renewTokenSpy).toHaveBeenCalledTimes(1);
  });

  it('hands the source the token the failed request actually carried', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials));
    let token: string | null = 'stale-token';
    const { source, renewTokenSpy } = createSourceStub(
      () => token,
      () => {
        token = 'fresh-token';

        return Promise.resolve(token);
      },
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await client.get(PROTECTED_PATH, { schema: okSchema });

    expect(renewTokenSpy).toHaveBeenCalledWith('stale-token');
  });

  it('hands the source null when the failed request was unauthenticated', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials));
    let token: string | null = null;
    const { source, renewTokenSpy } = createSourceStub(
      () => token,
      () => {
        token = 'fresh-token';

        return Promise.resolve(token);
      },
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await client.get(PROTECTED_PATH, { schema: okSchema });

    expect(renewTokenSpy).toHaveBeenCalledWith(null);
    expect(sentCredentials).toStrictEqual([null, 'Bearer fresh-token']);
  });

  it('sends no authorization header on a replay the source can no longer credential', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeFirstRequest(sentCredentials));
    let token: string | null = 'stale-token';
    const { source } = createSourceStub(
      () => token,
      () => {
        token = null;

        return Promise.resolve('fresh-token');
      },
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await client.get(PROTECTED_PATH, { schema: okSchema });

    expect(sentCredentials).toStrictEqual(['Bearer stale-token', null]);
  });

  it('renews exactly once when the replay is unauthorized as well', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeUntilTheThirdRequest(sentCredentials));
    const { source, renewTokenSpy } = createSourceStub(
      () => 'token-1',
      () => Promise.resolve('token-2'),
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await expect(client.get(PROTECTED_PATH, { schema: okSchema })).rejects.toMatchObject({
      kind: 'client',
      status: 401,
    });
    expect(renewTokenSpy).toHaveBeenCalledTimes(1);
    expect(sentCredentials).toHaveLength(2);
  });

  it('rejects with the original failure and never replays when renewal yields no token', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeEveryRequest(sentCredentials));
    const { source } = createSourceStub(() => 'token-1', neverRenews);
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    const failure = await client
      .get(PROTECTED_PATH, { schema: okSchema })
      .catch((error: unknown) => error);

    expect(isHttpError(failure)).toBe(true);
    expect(failure).toMatchObject({ kind: 'client', status: 401 });
    expect(sentCredentials).toHaveLength(1);
  });

  it('rejects with an HttpError when the source itself rejects', async () => {
    const sentCredentials: (string | null)[] = [];
    server.use(unauthorizeEveryRequest(sentCredentials));
    const { source } = createSourceStub(
      () => 'token-1',
      () => Promise.reject(new Error('the source is broken')),
    );
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    const failure = await client
      .get(PROTECTED_PATH, { schema: okSchema })
      .catch((error: unknown) => error);

    expect(isHttpError(failure)).toBe(true);
    expect(failure).toMatchObject({ kind: 'client', status: 401 });
    expect(sentCredentials).toHaveLength(1);
  });

  it('leaves a failure that is not a 401 to the error mapper and never renews', async () => {
    server.use(
      http.get(`${BASE_URL}/forbidden`, () => new HttpResponse(null, { status: 403 })),
      http.get(`${BASE_URL}/broken`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${BASE_URL}/unreachable`, () => HttpResponse.error()),
    );
    const { source, renewTokenSpy } = createSourceStub(() => 'token-1', neverRenews);
    const client = createHttpClient({ baseUrl: BASE_URL, bearerTokenSource: source });

    await expect(client.get('/forbidden', { schema: okSchema })).rejects.toMatchObject({
      kind: 'client',
      status: 403,
    });
    await expect(client.get('/broken', { schema: okSchema })).rejects.toMatchObject({
      kind: 'server',
      status: 500,
    });
    await expect(client.get('/unreachable', { schema: okSchema })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(renewTokenSpy).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized failure that carries no request config instead of replaying it', async () => {
    const unauthorizedWithoutConfig = new AxiosError(
      'Request failed with status code 401',
      AxiosError.ERR_BAD_REQUEST,
      undefined,
      undefined,
      {
        data: null,
        status: 401,
        statusText: 'Unauthorized',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      },
    );
    const { source, renewTokenSpy } = createSourceStub(() => 'token-1', neverRenews);
    const instance = axios.create({ adapter: () => Promise.reject(unauthorizedWithoutConfig) });
    attachBearerToken(instance, source);

    const failure = await instance
      .request({ url: PROTECTED_PATH })
      .catch((error: unknown) => error);

    expect(isHttpError(failure)).toBe(true);
    expect(renewTokenSpy).not.toHaveBeenCalled();
  });

  it('rejects a failure that is not an axios error without renewing', async () => {
    const { source, renewTokenSpy } = createSourceStub(() => 'token-1', neverRenews);
    const instance = axios.create({
      adapter: () => Promise.reject(new Error('the adapter is broken')),
    });
    attachBearerToken(instance, source);

    const failure = await instance
      .request({ url: PROTECTED_PATH })
      .catch((error: unknown) => error);

    expect(isHttpError(failure)).toBe(true);
    expect(failure).toMatchObject({ kind: 'unknown' });
    expect(renewTokenSpy).not.toHaveBeenCalled();
  });
});
