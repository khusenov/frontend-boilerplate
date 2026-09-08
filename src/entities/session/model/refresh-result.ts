import type { AccessToken } from './access-token';

export type RefreshResult =
  | { readonly status: 'refreshed'; readonly accessToken: AccessToken }
  | { readonly status: 'expired' }
  | { readonly status: 'unavailable' };
