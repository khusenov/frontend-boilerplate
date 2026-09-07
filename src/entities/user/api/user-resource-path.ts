import { toHttpError } from '@/shared/api';

import type { UserId } from '../model/user';

const USERS_RESOURCE_SCOPE = 'users';
const UNUSABLE_IDENTIFIER_SEGMENTS: readonly string[] = ['', '.', '..'];

export function userResourcePath(userId: UserId): string {
  if (UNUSABLE_IDENTIFIER_SEGMENTS.includes(userId)) {
    throw toHttpError(new Error('A user identifier may not be empty or a dot segment.'));
  }

  return `/${USERS_RESOURCE_SCOPE}/${encodeURIComponent(userId)}`;
}
