declare const userIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: 'UserId' };

export type UserStatus = 'active' | 'inactive' | 'pending';

export interface User {
  readonly id: UserId;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly joinedAt: Date;
}

export interface UserNameChange {
  readonly firstName: string;
  readonly lastName: string;
}

export function toUserId(value: string): UserId {
  return value as UserId;
}
