import { describe, expect, it } from 'vitest';

import type { UserNameChange } from '@/entities/user';

import { createUserNameChangeSchema, MAXIMUM_NAME_LENGTH } from './user-name-change-schema';

const messages = {
  firstNameRequired: 'Enter a first name.',
  lastNameRequired: 'Enter a last name.',
  nameTooLong: 'Use at most 100 characters.',
};

const schema = createUserNameChangeSchema(messages);

async function validate(value: UserNameChange) {
  return schema['~standard'].validate(value);
}

async function messagesFor(value: UserNameChange): Promise<readonly string[]> {
  const result = await validate(value);

  return result.issues?.map((issue) => issue.message) ?? [];
}

describe('createUserNameChangeSchema', () => {
  it('accepts a first and last name', async () => {
    const result = await validate({ firstName: 'Ada', lastName: 'Lovelace' });

    expect(result.issues).toBeUndefined();
    expect(result).toHaveProperty('value', { firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('rejects a whitespace-only first name, which a minimum length check would accept', async () => {
    await expect(messagesFor({ firstName: '   ', lastName: 'Lovelace' })).resolves.toStrictEqual([
      messages.firstNameRequired,
    ]);
  });

  it('rejects an empty last name', async () => {
    await expect(messagesFor({ firstName: 'Ada', lastName: '' })).resolves.toStrictEqual([
      messages.lastNameRequired,
    ]);
  });

  it('rejects a name whose trimmed length exceeds the limit', async () => {
    const tooLong = 'a'.repeat(MAXIMUM_NAME_LENGTH + 1);

    await expect(messagesFor({ firstName: tooLong, lastName: 'Lovelace' })).resolves.toStrictEqual([
      messages.nameTooLong,
    ]);
  });

  it('accepts a padded name that trims to exactly the limit', async () => {
    const atLimit = ` ${'a'.repeat(MAXIMUM_NAME_LENGTH)} `;
    const result = await validate({ firstName: atLimit, lastName: 'Lovelace' });

    expect(result.issues).toBeUndefined();
  });

  it('surfaces the caller supplied message for every rule', async () => {
    await expect(messagesFor({ firstName: '', lastName: '' })).resolves.toStrictEqual([
      messages.firstNameRequired,
      messages.lastNameRequired,
    ]);
  });
});
