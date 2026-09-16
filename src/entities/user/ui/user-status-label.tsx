import { useTranslation } from '@/shared/i18n';

import type { UserStatus } from '../model/user';

const STATUS_LABEL_KEYS = {
  active: 'user.statuses.active',
  inactive: 'user.statuses.inactive',
  pending: 'user.statuses.pending',
} as const satisfies Record<UserStatus, string>;

interface UserStatusLabelProps {
  readonly status: UserStatus;
}

export function UserStatusLabel({ status }: UserStatusLabelProps) {
  const { t } = useTranslation();

  return t(STATUS_LABEL_KEYS[status]);
}
