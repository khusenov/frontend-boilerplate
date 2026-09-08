import type { AccessToken } from '../model/access-token';
import { toAccessToken } from '../model/access-token';

import type { RefreshSessionResponseDto } from './session-dto';

export function toRefreshedAccessToken(dto: RefreshSessionResponseDto): AccessToken {
  return toAccessToken(dto.accessToken);
}
