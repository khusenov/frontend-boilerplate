import { describe, expect, it } from 'vitest';

import { toIssuedAccessToken, toRefreshedAccessToken, toSignInRequestDto } from './session-mapper';

describe('toRefreshedAccessToken', () => {
  it('takes the access token out of the refresh response', () => {
    expect(toRefreshedAccessToken({ accessToken: 'abc' })).toBe('abc');
  });
});

describe('toIssuedAccessToken', () => {
  it('takes the access token out of the sign-in response', () => {
    expect(toIssuedAccessToken({ accessToken: 'issued-token' })).toBe('issued-token');
  });
});

describe('toSignInRequestDto', () => {
  it('trims and lowercases the email the user typed', () => {
    expect(toSignInRequestDto({ email: '  Ada@Example.COM ', password: 'secret' })).toStrictEqual({
      email: 'ada@example.com',
      password: 'secret',
    });
  });

  it('preserves password whitespace, which trimming would silently lock a user out of', () => {
    expect(toSignInRequestDto({ email: 'ada@example.com', password: '  spaced  ' })).toStrictEqual({
      email: 'ada@example.com',
      password: '  spaced  ',
    });
  });

  it('preserves password case', () => {
    expect(toSignInRequestDto({ email: 'ada@example.com', password: 'MiXeD' })).toStrictEqual({
      email: 'ada@example.com',
      password: 'MiXeD',
    });
  });
});
