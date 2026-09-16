import type { StandardSchemaV1 } from '@standard-schema/spec';
import * as zm from 'zod/mini';

import type { UserNameChange } from '@/entities/user';

export const MAXIMUM_NAME_LENGTH = 100;

export interface UserNameChangeMessages {
  readonly firstNameRequired: string;
  readonly lastNameRequired: string;
  readonly nameTooLong: string;
}

export type UserNameChangeSchema = StandardSchemaV1<UserNameChange, UserNameChange>;

function toNormalizedName(value: string): string {
  return value.trim();
}

function isPresent(value: string): boolean {
  return toNormalizedName(value).length > 0;
}

function isWithinLimit(value: string): boolean {
  return toNormalizedName(value).length <= MAXIMUM_NAME_LENGTH;
}

export function createUserNameChangeSchema(messages: UserNameChangeMessages): UserNameChangeSchema {
  return zm.object({
    firstName: zm
      .string()
      .check(
        zm.refine(isPresent, messages.firstNameRequired),
        zm.refine(isWithinLimit, messages.nameTooLong),
      ),
    lastName: zm
      .string()
      .check(
        zm.refine(isPresent, messages.lastNameRequired),
        zm.refine(isWithinLimit, messages.nameTooLong),
      ),
  });
}
