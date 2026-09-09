import type { AccessToken } from './access-token';

export type SignInOutcome =
  | { readonly status: 'signed-in'; readonly accessToken?: never }
  | { readonly status: 'rejected' }
  | { readonly status: 'rate-limited' }
  | { readonly status: 'unavailable' };

export type SignInResult =
  | { readonly status: 'signed-in'; readonly accessToken: AccessToken }
  | { readonly status: 'rejected' }
  | { readonly status: 'rate-limited' }
  | { readonly status: 'unavailable' };
