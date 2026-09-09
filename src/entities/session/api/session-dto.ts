import * as zm from 'zod/mini';

const accessTokenDtoSchema = zm.string().check(zm.minLength(1));

export const refreshSessionResponseDtoSchema = zm.object({
  accessToken: accessTokenDtoSchema,
});

export type RefreshSessionResponseDto = zm.infer<typeof refreshSessionResponseDtoSchema>;

export const signInResponseDtoSchema = zm.object({
  accessToken: accessTokenDtoSchema,
});

export type SignInResponseDto = zm.infer<typeof signInResponseDtoSchema>;

export interface SignInRequestDto {
  readonly email: string;
  readonly password: string;
}
