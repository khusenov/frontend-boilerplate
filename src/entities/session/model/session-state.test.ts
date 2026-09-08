import { describe, expect, it } from 'vitest';

import { toAccessToken } from './access-token';
import { readAccessToken } from './session-state';

describe('readAccessToken', () => {
  it('reads the token out of an authenticated session', () => {
    const accessToken = toAccessToken('token-1');

    expect(readAccessToken({ status: 'authenticated', accessToken })).toBe(accessToken);
  });

  it('reads no token from an anonymous session', () => {
    expect(readAccessToken({ status: 'anonymous' })).toBeNull();
  });

  it('reads no token from an unknown session', () => {
    expect(readAccessToken({ status: 'unknown' })).toBeNull();
  });
});
