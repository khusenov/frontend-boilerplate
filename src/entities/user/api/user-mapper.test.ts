import { describe, expect, it } from 'vitest';

import type { UserDto } from './user-dto';
import { toUser } from './user-mapper';

const adaDto: UserDto = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

describe('toUser', () => {
  it('joins the wire name fields into a single display name', () => {
    expect(toUser(adaDto).displayName).toBe('Ada Lovelace');
  });

  it('trims the display name when the wire sends an empty surname', () => {
    expect(toUser({ ...adaDto, last_name: '' }).displayName).toBe('Ada');
  });

  it('translates every wire role into its domain role', () => {
    expect(toUser({ ...adaDto, role: 'ADMIN' }).role).toBe('admin');
    expect(toUser({ ...adaDto, role: 'MEMBER' }).role).toBe('member');
    expect(toUser({ ...adaDto, role: 'VIEWER' }).role).toBe('viewer');
  });

  it('parses the wire timestamp into a date', () => {
    expect(toUser(adaDto).joinedAt).toStrictEqual(new Date('2024-01-05T12:00:00.000Z'));
  });

  it('carries the identifier across unchanged', () => {
    expect(toUser(adaDto).id).toBe('u_1');
  });

  it('keeps no wire field names on the domain model', () => {
    expect(Object.keys(toUser(adaDto)).sort()).toStrictEqual([
      'displayName',
      'email',
      'id',
      'joinedAt',
      'role',
    ]);
  });
});
