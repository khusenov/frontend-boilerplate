import { toUserId } from '../model/user';
import type { User, UserNameChange, UserRole } from '../model/user';

import type { UpdateUserNameDto, UserDto } from './user-dto';

const USER_ROLE_BY_WIRE_VALUE: Record<UserDto['role'], UserRole> = {
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
};

export function toUser(dto: UserDto): User {
  const firstName = dto.first_name.trim();
  const lastName = dto.last_name.trim();

  return {
    id: toUserId(dto.id),
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    email: dto.email,
    role: USER_ROLE_BY_WIRE_VALUE[dto.role],
    joinedAt: new Date(dto.created_at),
  };
}

export function toUpdateUserNameDto(change: UserNameChange): UpdateUserNameDto {
  return {
    first_name: change.firstName.trim(),
    last_name: change.lastName.trim(),
  };
}
