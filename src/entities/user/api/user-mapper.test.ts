import { describe, expect, it } from 'vitest';

import type { UserDto } from './user-dto';
import { toUpdateUserNameDto, toUser } from './user-mapper';

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

  it('keeps the name parts the domain needs to edit a name', () => {
    const ada = toUser(adaDto);

    expect(ada.firstName).toBe('Ada');
    expect(ada.lastName).toBe('Lovelace');
  });

  it('trims the display name when the wire sends an empty surname', () => {
    expect(toUser({ ...adaDto, last_name: '' }).displayName).toBe('Ada');
  });

  it('leaves no double space in the display name when a wire field is padded', () => {
    const padded = toUser({ ...adaDto, first_name: ' Ada ', last_name: ' Lovelace ' });

    expect(padded.displayName).toBe('Ada Lovelace');
    expect(padded.firstName).toBe('Ada');
    expect(padded.lastName).toBe('Lovelace');
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
      'firstName',
      'id',
      'joinedAt',
      'lastName',
      'role',
    ]);
  });
});

describe('toUpdateUserNameDto', () => {
  it('renames the domain name parts into the wire vocabulary', () => {
    expect(toUpdateUserNameDto({ firstName: 'Ada', lastName: 'Lovelace' })).toStrictEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
  });

  it('trims each part so the payload matches what the schema validated', () => {
    expect(toUpdateUserNameDto({ firstName: '  Ada  ', lastName: '  King  ' })).toStrictEqual({
      first_name: 'Ada',
      last_name: 'King',
    });
  });

  it('sends no field the wire contract does not name', () => {
    const dto = toUpdateUserNameDto({ firstName: 'Ada', lastName: 'Lovelace' });

    expect(Object.keys(dto).sort()).toStrictEqual(['first_name', 'last_name']);
  });

  it('leaves its argument unmutated', () => {
    const change = { firstName: '  Ada  ', lastName: '  King  ' };

    toUpdateUserNameDto(change);

    expect(change).toStrictEqual({ firstName: '  Ada  ', lastName: '  King  ' });
  });
});
