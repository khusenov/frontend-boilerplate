import * as zm from 'zod/mini';

export const userDtoSchema = zm.object({
  id: zm.uuid(),
  firstName: zm.string(),
  lastName: zm.string(),
  fullName: zm.string(),
  email: zm.email(),
  status: zm.enum(['active', 'inactive', 'pending']),
  createdAt: zm.iso.datetime({ offset: true }),
});

export type UserDto = zm.infer<typeof userDtoSchema>;

export interface UpdateUserNameRequestDto {
  readonly firstName: string;
  readonly lastName: string;
}
