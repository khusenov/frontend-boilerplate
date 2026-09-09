import { useTranslation } from '@/shared/i18n';

import type { SignInStatus } from '../model/sign-in-status';

const MESSAGE_KEY_BY_STATUS = {
  idle: undefined,
  'rate-limited': 'signIn.rateLimited',
  rejected: 'signIn.rejected',
  'signed-in': undefined,
  submitting: undefined,
  unavailable: 'signIn.unavailable',
} as const satisfies Record<SignInStatus, string | undefined>;

interface SignInAlertProps {
  readonly status: SignInStatus;
}

export function SignInAlert({ status }: SignInAlertProps) {
  const { t } = useTranslation();
  const messageKey = MESSAGE_KEY_BY_STATUS[status];

  return (
    <p className="text-sm text-destructive" role="alert">
      {messageKey === undefined ? '' : t(messageKey)}
    </p>
  );
}
