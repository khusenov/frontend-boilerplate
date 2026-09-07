import type { MutationStatus } from '@tanstack/react-query';

export type UpdateUserNameStatus = 'failed' | 'idle' | 'saved' | 'saving';

const STATUS_BY_MUTATION_STATUS = {
  error: 'failed',
  idle: 'idle',
  pending: 'saving',
  success: 'saved',
} as const satisfies Record<MutationStatus, UpdateUserNameStatus>;

export function toUpdateUserNameStatus(status: MutationStatus): UpdateUserNameStatus {
  return STATUS_BY_MUTATION_STATUS[status];
}
