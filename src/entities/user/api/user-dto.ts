import * as zm from 'zod/mini';

export const userDtoSchema = zm.object({
  id: zm.string(),
  first_name: zm.string(),
  last_name: zm.string(),
  email: zm.email(),
  role: zm.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  created_at: zm.iso.datetime({ offset: true }),
});

export type UserDto = zm.infer<typeof userDtoSchema>;
