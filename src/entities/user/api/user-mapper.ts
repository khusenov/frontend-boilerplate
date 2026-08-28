import { toUserId } from '../model/user';
import type { User, UserRole } from '../model/user';

import type { UserDto } from './user-dto';

const USER_ROLE_BY_WIRE_VALUE: Record<UserDto['role'], UserRole> = {
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
};

export function toUser(dto: UserDto): User {
  return {
    id: toUserId(dto.id),
    displayName: `${dto.first_name} ${dto.last_name}`.trim(),
    email: dto.email,
    role: USER_ROLE_BY_WIRE_VALUE[dto.role],
    joinedAt: new Date(dto.created_at),
  };
}
