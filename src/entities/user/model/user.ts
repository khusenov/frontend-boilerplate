declare const userIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: 'UserId' };

export type UserRole = 'admin' | 'member' | 'viewer';

export interface User {
  readonly id: UserId;
  readonly displayName: string;
  readonly email: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
}

export function toUserId(value: string): UserId {
  return value as UserId;
}
