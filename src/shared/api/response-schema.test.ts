import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isHttpError } from './http-error';
import type { ResponseSchema } from './response-schema';
import { noContentSchema, parseResponse } from './response-schema';

const CONTEXT = { method: 'GET', url: '/users/1', status: 200 } as const;

const userSchema = z.object({ id: z.number(), name: z.string(), tags: z.array(z.string()) });

function schemaOf(validate: ResponseSchema<never>['~standard']['validate']): ResponseSchema<never> {
  return { '~standard': { version: 1, vendor: 'test', validate } };
}

describe('parseResponse', () => {
  it('returns the validated value when the body matches the schema', async () => {
    const body = { id: 1, name: 'Ada', tags: ['admin'] };

    await expect(parseResponse(userSchema, body, CONTEXT)).resolves.toStrictEqual(body);
  });

  it('strips unknown keys the schema does not declare', async () => {
    const body = { id: 1, name: 'Ada', tags: [], extra: 'leaked' };

    await expect(parseResponse(userSchema, body, CONTEXT)).resolves.toStrictEqual({
      id: 1,
      name: 'Ada',
      tags: [],
    });
  });

  it('rejects a mismatched body as a validation HttpError describing the exchange', async () => {
    await expect(parseResponse(userSchema, { id: 'one' }, CONTEXT)).rejects.toMatchObject({
      kind: 'validation',
      status: 200,
      method: 'GET',
      url: '/users/1',
    });
  });

  it('never copies the offending body onto the error', async () => {
    const body = { id: 'one', name: 'secret@example.com' };
    const failure = await parseResponse(userSchema, body, CONTEXT).catch((error: unknown) => error);

    expect(failure).toMatchObject({ payload: null });
    expect(JSON.stringify(failure)).not.toContain('secret@example.com');
  });

  it('reports a dotted path for a nested field', async () => {
    const nestedSchema = z.object({ profile: z.object({ email: z.string() }) });

    await expect(parseResponse(nestedSchema, { profile: {} }, CONTEXT)).rejects.toMatchObject({
      issues: [{ path: 'profile.email' }],
    });
  });

  it('reports an index path for an array element', async () => {
    const body = { id: 1, name: 'Ada', tags: [42] };

    await expect(parseResponse(userSchema, body, CONTEXT)).rejects.toMatchObject({
      issues: [{ path: 'tags.0' }],
    });
  });

  it('reports an empty path for a root level issue', async () => {
    await expect(parseResponse(userSchema, 'not an object', CONTEXT)).rejects.toMatchObject({
      issues: [{ path: '' }],
    });
  });

  it('reads the key from an object path segment', async () => {
    const segmentSchema = schemaOf(() => ({
      issues: [{ message: 'Bad', path: [{ key: 'outer' }, { key: 0 }] }],
    }));

    await expect(parseResponse(segmentSchema, {}, CONTEXT)).rejects.toMatchObject({
      issues: [{ path: 'outer.0' }],
    });
  });

  it('keeps one issue per failing field, each carrying a message', async () => {
    const failure = await parseResponse(userSchema, {}, CONTEXT).catch((error: unknown) => error);
    const issues = isHttpError(failure) ? failure.issues : [];

    expect(issues.map((issue) => issue.path)).toStrictEqual(['id', 'name', 'tags']);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });

  it('awaits a schema whose validate returns a promise', async () => {
    const asyncSchema: ResponseSchema<string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: unknown) => Promise.resolve({ value: String(value) }),
      },
    };

    await expect(parseResponse(asyncSchema, 7, CONTEXT)).resolves.toBe('7');
  });

  it('normalizes a schema that throws into an unknown HttpError with no issues', async () => {
    const throwingSchema = schemaOf(() => {
      throw new Error('schema exploded');
    });

    await expect(parseResponse(throwingSchema, {}, CONTEXT)).rejects.toMatchObject({
      kind: 'unknown',
      status: 200,
      method: 'GET',
      url: '/users/1',
      issues: [],
    });
  });

  it('normalizes a schema whose validate rejects', async () => {
    const rejectingSchema = schemaOf(() => Promise.reject(new Error('schema exploded')));

    await expect(parseResponse(rejectingSchema, {}, CONTEXT)).rejects.toMatchObject({
      kind: 'unknown',
      issues: [],
    });
  });

  it('keeps the thrown schema error as the cause', async () => {
    const cause = new Error('schema exploded');
    const throwingSchema = schemaOf(() => {
      throw cause;
    });
    const failure = await parseResponse(throwingSchema, {}, CONTEXT).catch(
      (error: unknown) => error,
    );

    expect(isHttpError(failure) && failure.cause).toBe(cause);
  });
});

describe('noContentSchema', () => {
  it.each([[''], [null], [undefined]])('accepts %s as an empty body', async (body) => {
    await expect(parseResponse(noContentSchema, body, CONTEXT)).resolves.toBeNull();
  });

  it('rejects a body that is not empty', async () => {
    await expect(parseResponse(noContentSchema, { id: 1 }, CONTEXT)).rejects.toMatchObject({
      kind: 'validation',
      issues: [{ path: '', message: 'Expected an empty response body' }],
    });
  });
});
