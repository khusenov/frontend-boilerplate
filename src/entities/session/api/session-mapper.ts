import type { AccessToken } from '../model/access-token';
import { toAccessToken } from '../model/access-token';
import type { Credentials } from '../model/credentials';
import { toNormalizedEmail } from '../model/credentials';

import type { RefreshSessionResponseDto, SignInRequestDto, SignInResponseDto } from './session-dto';

export function toRefreshedAccessToken(dto: RefreshSessionResponseDto): AccessToken {
  return toAccessToken(dto.accessToken);
}

export function toIssuedAccessToken(dto: SignInResponseDto): AccessToken {
  return toAccessToken(dto.accessToken);
}

export function toSignInRequestDto(credentials: Credentials): SignInRequestDto {
  return {
    email: toNormalizedEmail(credentials.email),
    password: credentials.password,
  };
}
