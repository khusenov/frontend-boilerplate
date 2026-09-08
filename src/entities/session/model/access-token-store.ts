import type { AccessToken } from './access-token';

export interface AccessTokenStore {
  readonly read: () => AccessToken | null;
  readonly hasEnded: () => boolean;
  readonly write: (accessToken: AccessToken) => void;
  readonly clear: () => void;
}

export function createAccessTokenStore(): AccessTokenStore {
  let accessToken: AccessToken | null = null;
  let ended = false;

  return {
    read: () => accessToken,
    hasEnded: () => ended,
    write: (value: AccessToken) => {
      accessToken = value;
      ended = false;
    },
    clear: () => {
      accessToken = null;
      ended = true;
    },
  };
}
