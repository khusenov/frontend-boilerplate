import * as zm from 'zod/mini';

export const refreshSessionResponseDtoSchema = zm.object({
  accessToken: zm.string(),
});

export type RefreshSessionResponseDto = zm.infer<typeof refreshSessionResponseDtoSchema>;
