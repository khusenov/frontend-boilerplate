import { describe, expect, it } from 'vitest';

import { toRefreshedAccessToken } from './session-mapper';

describe('toRefreshedAccessToken', () => {
  it('takes the access token out of the refresh response', () => {
    expect(toRefreshedAccessToken({ accessToken: 'abc' })).toBe('abc');
  });
});
