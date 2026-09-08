import type { AccessToken } from './access-token';

export type SessionState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated'; readonly accessToken: AccessToken }
  | { readonly status: 'unknown' };

export type SessionStatus = SessionState['status'];

export function readAccessToken(state: SessionState): AccessToken | null {
  switch (state.status) {
    case 'anonymous':
    case 'unknown':
      return null;
    case 'authenticated':
      return state.accessToken;
  }
}
