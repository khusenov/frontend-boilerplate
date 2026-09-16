import { useTranslation } from '@/shared/i18n';

import type { UpdateUserNameStatus } from '../model/update-user-name-status';

const MESSAGE_KEY_BY_STATUS = {
  failed: 'updateUserName.failed',
  idle: undefined,
  saved: undefined,
  saving: undefined,
} as const satisfies Record<UpdateUserNameStatus, string | undefined>;

interface UpdateUserNameAlertProps {
  readonly status: UpdateUserNameStatus;
}

export function UpdateUserNameAlert({ status }: UpdateUserNameAlertProps) {
  const { t } = useTranslation();
  const messageKey = MESSAGE_KEY_BY_STATUS[status];

  return (
    <p className="text-sm text-destructive" role="alert">
      {messageKey === undefined ? '' : t(messageKey)}
    </p>
  );
}
