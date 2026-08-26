import { describe, expect, it } from 'vitest';

import { HttpError, isHttpError, toHttpError } from './http-error';

describe('toHttpError', () => {
  it('returns an existing HttpError untouched', () => {
    const original = toHttpError(new Error('boom'));

    expect(toHttpError(original)).toBe(original);
  });

  it('wraps a plain error, keeping its message and the original as the cause', () => {
    const cause = new Error('boom');
    const httpError = toHttpError(cause);

    expect(httpError.message).toBe('boom');
    expect(httpError.kind).toBe('unknown');
    expect(httpError.cause).toBe(cause);
  });

  it('wraps a thrown string using the string as the message', () => {
    expect(toHttpError('boom')).toMatchObject({ message: 'boom', kind: 'unknown' });
  });

  it('wraps a thrown non-string value with a fallback message', () => {
    expect(toHttpError({ nope: true })).toMatchObject({
      message: 'Unknown failure',
      kind: 'unknown',
    });
  });

  it('leaves every request detail null when there is no request to describe', () => {
    expect(toHttpError('boom')).toMatchObject({
      status: null,
      method: null,
      url: null,
      payload: null,
    });
  });
});

describe('HttpError', () => {
  it('exposes the details it was built from', () => {
    const details = {
      kind: 'client',
      status: 404,
      method: 'GET',
      url: '/things',
      payload: { detail: 'gone' },
    } as const;

    expect(new HttpError('failed', details, null)).toMatchObject(details);
  });

  it('is named so stack traces stay readable', () => {
    expect(toHttpError('boom').name).toBe('HttpError');
  });
});

describe('isHttpError', () => {
  it('accepts an HttpError', () => {
    expect(isHttpError(toHttpError('boom'))).toBe(true);
  });

  it('rejects a plain error', () => {
    expect(isHttpError(new Error('boom'))).toBe(false);
  });
});
