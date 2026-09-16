import { toUserId } from '../model/user';
import type { User, UserNameChange } from '../model/user';

import type { UpdateUserNameRequestDto, UserDto } from './user-dto';

export function toUser(dto: UserDto): User {
  return {
    id: toUserId(dto.id),
    firstName: dto.firstName,
    lastName: dto.lastName,
    displayName: dto.fullName,
    email: dto.email,
    status: dto.status,
    joinedAt: new Date(dto.createdAt),
  };
}

export function toUpdateUserNameRequestDto(change: UserNameChange): UpdateUserNameRequestDto {
  return {
    firstName: change.firstName.trim(),
    lastName: change.lastName.trim(),
  };
}
