// @vitest-environment node
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createHttpClient } from './http-client';
import { isHttpError } from './http-error';
import { noContentSchema } from './response-schema';

const BASE_URL = 'https://api.test';

const idSchema = z.object({ id: z.string() });
const headerValueSchema = z.object({ value: z.string().nullable() });
const pageSchema = z.object({ page: z.string().nullable() });
const nameSchema = z.object({ name: z.string() });
const verbSchema = z.object({ verb: z.string() });

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

function respondWithRequestHeader(path: string, header: string) {
  return http.get(`${BASE_URL}${path}`, ({ request }) =>
    HttpResponse.json({ value: request.headers.get(header) }),
  );
}

describe('createHttpClient', () => {
  it('resolves the validated body of a successful request', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => HttpResponse.json({ id: 'a' })));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: idSchema })).resolves.toStrictEqual({ id: 'a' });
  });

  it('asks for json by default', async () => {
    server.use(respondWithRequestHeader('/things', 'accept'));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: headerValueSchema })).resolves.toStrictEqual({
      value: 'application/json',
    });
  });

  it('sends query parameters', async () => {
    server.use(
      http.get(`${BASE_URL}/things`, ({ request }) =>
        HttpResponse.json({ page: new URL(request.url).searchParams.get('page') }),
      ),
    );
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(
      client.get('/things', { params: { page: 2 }, schema: pageSchema }),
    ).resolves.toStrictEqual({ page: '2' });
  });

  it('sends caller supplied headers', async () => {
    server.use(respondWithRequestHeader('/things', 'x-locale'));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(
      client.get('/things', { headers: { 'X-Locale': 'en-GB' }, schema: headerValueSchema }),
    ).resolves.toStrictEqual({ value: 'en-GB' });
  });

  it('sends a request body and returns the created resource', async () => {
    server.use(
      http.post(`${BASE_URL}/things`, async ({ request }) =>
        HttpResponse.json(await request.json(), { status: 201 }),
      ),
    );
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(
      client.post('/things', { body: { name: 'kettle' }, schema: nameSchema }),
    ).resolves.toStrictEqual({ name: 'kettle' });
  });

  it('supports put, patch and delete', async () => {
    server.use(
      http.put(`${BASE_URL}/things/1`, () => HttpResponse.json({ verb: 'put' })),
      http.patch(`${BASE_URL}/things/1`, () => HttpResponse.json({ verb: 'patch' })),
      http.delete(`${BASE_URL}/things/1`, () => HttpResponse.json({ verb: 'delete' })),
    );
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.put('/things/1', { body: {}, schema: verbSchema })).resolves.toStrictEqual({
      verb: 'put',
    });
    await expect(
      client.patch('/things/1', { body: {}, schema: verbSchema }),
    ).resolves.toStrictEqual({ verb: 'patch' });
    await expect(client.delete('/things/1', { schema: verbSchema })).resolves.toStrictEqual({
      verb: 'delete',
    });
  });

  it('resolves a 204 with no body through the no content schema', async () => {
    server.use(http.delete(`${BASE_URL}/things/1`, () => new HttpResponse(null, { status: 204 })));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.delete('/things/1', { schema: noContentSchema })).resolves.toBeNull();
  });

  it('rejects a 200 whose body does not match the schema', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => HttpResponse.json({ id: 42 })));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: idSchema })).rejects.toMatchObject({
      kind: 'validation',
      status: 200,
      method: 'GET',
      url: '/things',
      issues: [{ path: 'id' }],
    });
  });

  it('attaches the headers the auth reader supplies', async () => {
    server.use(respondWithRequestHeader('/me', 'authorization'));
    const client = createHttpClient({
      baseUrl: BASE_URL,
      getAuthHeaders: () => ({ Authorization: 'Bearer token-123' }),
    });

    await expect(client.get('/me', { schema: headerValueSchema })).resolves.toStrictEqual({
      value: 'Bearer token-123',
    });
  });

  it('sends no auth header when the reader supplies none', async () => {
    server.use(respondWithRequestHeader('/me', 'authorization'));
    const client = createHttpClient({ baseUrl: BASE_URL, getAuthHeaders: () => ({}) });

    await expect(client.get('/me', { schema: headerValueSchema })).resolves.toStrictEqual({
      value: null,
    });
  });

  it('sends no auth header when no reader is configured', async () => {
    server.use(respondWithRequestHeader('/me', 'authorization'));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/me', { schema: headerValueSchema })).resolves.toStrictEqual({
      value: null,
    });
  });

  it('keeps redacted headers and the schema out of a serialized failure', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => new HttpResponse(null, { status: 500 })));
    const client = createHttpClient({
      baseUrl: BASE_URL,
      getAuthHeaders: () => ({ 'X-Api-Key': 'super-secret' }),
      redactedHeaders: ['x-api-key'],
    });

    const failure = await client
      .get('/things', { schema: idSchema })
      .catch((error: unknown) => error);
    const serialized = JSON.stringify(isHttpError(failure) ? failure.cause : null);

    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('"schema"');
  });

  it('rejects a 4xx as a client HttpError carrying the payload', async () => {
    server.use(
      http.get(`${BASE_URL}/things`, () => HttpResponse.json({ detail: 'nope' }, { status: 422 })),
    );
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: idSchema })).rejects.toMatchObject({
      kind: 'client',
      status: 422,
      payload: { detail: 'nope' },
    });
  });

  it('rejects a 5xx as a server HttpError', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => new HttpResponse(null, { status: 500 })));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: idSchema })).rejects.toMatchObject({
      kind: 'server',
      status: 500,
    });
  });

  it('rejects an unreachable server as a network HttpError', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => HttpResponse.error()));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: idSchema })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('rejects a slow response as a timeout HttpError', async () => {
    server.use(
      http.get(`${BASE_URL}/things`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    const client = createHttpClient({ baseUrl: BASE_URL, timeoutMilliseconds: 20 });

    await expect(client.get('/things', { schema: idSchema })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('rejects an aborted request as a canceled HttpError', async () => {
    server.use(
      http.get(`${BASE_URL}/things`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    const client = createHttpClient({ baseUrl: BASE_URL });
    const controller = new AbortController();
    const pending = client.get('/things', { signal: controller.signal, schema: idSchema });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'canceled' });
  });

  it('always rejects with a normalized HttpError', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => new HttpResponse(null, { status: 500 })));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(
      client.get('/things', { schema: idSchema }).catch((error: unknown) => isHttpError(error)),
    ).resolves.toBe(true);
  });
});
