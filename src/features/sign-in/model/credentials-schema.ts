import type { StandardSchemaV1 } from '@standard-schema/spec';
import * as zm from 'zod/mini';

import type { Credentials } from '@/entities/session';

const EMAIL_FORMAT = zm.email();

export interface CredentialsMessages {
  readonly emailInvalid: string;
  readonly passwordRequired: string;
}

export type CredentialsSchema = StandardSchemaV1<Credentials, Credentials>;

function isEmailAddress(value: string): boolean {
  return zm.safeParse(EMAIL_FORMAT, value.trim()).success;
}

function isPresent(value: string): boolean {
  return value.length > 0;
}

export function createCredentialsSchema(messages: CredentialsMessages): CredentialsSchema {
  return zm.object({
    email: zm.string().check(zm.refine(isEmailAddress, messages.emailInvalid)),
    password: zm.string().check(zm.refine(isPresent, messages.passwordRequired)),
  });
}
