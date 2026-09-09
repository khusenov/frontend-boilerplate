export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export function toNormalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}
