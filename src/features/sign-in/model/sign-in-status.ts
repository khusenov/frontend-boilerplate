import type { MutationStatus } from '@tanstack/react-query';

import type { SignInOutcome } from '@/entities/session';

export type SignInStatus =
  'idle' | 'rate-limited' | 'rejected' | 'signed-in' | 'submitting' | 'unavailable';

const STATUS_BY_MUTATION_STATUS = {
  error: 'unavailable',
  idle: 'idle',
  pending: 'submitting',
  success: 'idle',
} as const satisfies Record<MutationStatus, SignInStatus>;

const IS_DISMISSIBLE_BY_STATUS = {
  idle: false,
  'rate-limited': true,
  rejected: true,
  'signed-in': true,
  submitting: false,
  unavailable: true,
} as const satisfies Record<SignInStatus, boolean>;

export function toSignInStatus(
  mutationStatus: MutationStatus,
  outcome: SignInOutcome | undefined,
): SignInStatus {
  return outcome?.status ?? STATUS_BY_MUTATION_STATUS[mutationStatus];
}

export function isDismissible(status: SignInStatus): boolean {
  return IS_DISMISSIBLE_BY_STATUS[status];
}
