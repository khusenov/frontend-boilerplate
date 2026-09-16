import { describe, expect, it } from 'vitest';

import type { UserDto } from './user-dto';
import { toUpdateUserNameRequestDto, toUser } from './user-mapper';

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';

const adaDto: UserDto = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
};

describe('toUser', () => {
  it('shows the full name the server composed as the display name', () => {
    expect(toUser({ ...adaDto, fullName: 'Ada King' }).displayName).toBe('Ada King');
  });

  it('keeps the name parts the domain needs to edit a name', () => {
    const ada = toUser(adaDto);

    expect(ada.firstName).toBe('Ada');
    expect(ada.lastName).toBe('Lovelace');
  });

  it('carries every wire status into the domain', () => {
    expect(toUser({ ...adaDto, status: 'active' }).status).toBe('active');
    expect(toUser({ ...adaDto, status: 'inactive' }).status).toBe('inactive');
    expect(toUser({ ...adaDto, status: 'pending' }).status).toBe('pending');
  });

  it('parses the wire timestamp into a date', () => {
    expect(toUser(adaDto).joinedAt).toStrictEqual(new Date('2024-01-05T12:00:00.000Z'));
  });

  it('carries the identifier across unchanged', () => {
    expect(toUser(adaDto).id).toBe(ADA_ID);
  });

  it('keeps no wire field names on the domain model', () => {
    expect(Object.keys(toUser(adaDto)).sort()).toStrictEqual([
      'displayName',
      'email',
      'firstName',
      'id',
      'joinedAt',
      'lastName',
      'status',
    ]);
  });
});

describe('toUpdateUserNameRequestDto', () => {
  it('carries both name parts into the wire payload', () => {
    expect(toUpdateUserNameRequestDto({ firstName: 'Ada', lastName: 'Lovelace' })).toStrictEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('trims each part so the payload matches what the schema validated', () => {
    expect(
      toUpdateUserNameRequestDto({ firstName: '  Ada  ', lastName: '  King  ' }),
    ).toStrictEqual({ firstName: 'Ada', lastName: 'King' });
  });

  it('sends only the name parts even when the change object carries more', () => {
    const changeWithEmail = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' };

    expect(Object.keys(toUpdateUserNameRequestDto(changeWithEmail)).sort()).toStrictEqual([
      'firstName',
      'lastName',
    ]);
  });

  it('leaves its argument unmutated', () => {
    const change = { firstName: '  Ada  ', lastName: '  King  ' };

    toUpdateUserNameRequestDto(change);

    expect(change).toStrictEqual({ firstName: '  Ada  ', lastName: '  King  ' });
  });
});
