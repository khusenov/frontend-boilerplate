import { describe, expect, it } from 'vitest';

import type { Credentials } from '@/entities/session';

import { createCredentialsSchema } from './credentials-schema';

const messages = {
  emailInvalid: 'Enter a valid email address.',
  passwordRequired: 'Enter your password.',
};

const schema = createCredentialsSchema(messages);

async function validate(value: Credentials) {
  return schema['~standard'].validate(value);
}

async function messagesFor(value: Credentials): Promise<readonly string[]> {
  const result = await validate(value);

  return result.issues?.map((issue) => issue.message) ?? [];
}

describe('createCredentialsSchema', () => {
  it('accepts an email address and a password', async () => {
    const result = await validate({ email: 'ada@example.test', password: 'correct horse' });

    expect(result.issues).toBeUndefined();
    expect(result).toHaveProperty('value', {
      email: 'ada@example.test',
      password: 'correct horse',
    });
  });

  it('reports an empty email address once rather than as two competing rules', async () => {
    await expect(messagesFor({ email: '', password: 'correct horse' })).resolves.toStrictEqual([
      messages.emailInvalid,
    ]);
  });

  it('rejects an address with no domain', async () => {
    await expect(messagesFor({ email: 'ada@', password: 'correct horse' })).resolves.toStrictEqual([
      messages.emailInvalid,
    ]);
  });

  it('accepts a padded address, which the session mapper normalises before sending', async () => {
    const result = await validate({ email: '  ada@example.test  ', password: 'correct horse' });

    expect(result.issues).toBeUndefined();
  });

  it('rejects an empty password', async () => {
    await expect(messagesFor({ email: 'ada@example.test', password: '' })).resolves.toStrictEqual([
      messages.passwordRequired,
    ]);
  });

  it('accepts a password of only spaces, which trimming would have rejected', async () => {
    const result = await validate({ email: 'ada@example.test', password: '   ' });

    expect(result.issues).toBeUndefined();
  });

  it('surfaces the caller supplied message for every rule', async () => {
    await expect(messagesFor({ email: '', password: '' })).resolves.toStrictEqual([
      messages.emailInvalid,
      messages.passwordRequired,
    ]);
  });
});
