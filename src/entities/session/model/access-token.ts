declare const accessTokenBrand: unique symbol;

export type AccessToken = string & { readonly [accessTokenBrand]: 'AccessToken' };

export function toAccessToken(value: string): AccessToken {
  return value as AccessToken;
}
