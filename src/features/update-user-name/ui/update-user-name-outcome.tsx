import type { ReactElement } from 'react';

import { useTranslation } from '@/shared/i18n';

import type { UpdateUserNameStatus } from '../model/update-user-name-status';

type OutcomeRegion = 'alert' | 'none' | 'status';

interface UpdateUserNameOutcomeProps {
  readonly status: UpdateUserNameStatus;
}

function toOutcomeRegion(status: UpdateUserNameStatus): OutcomeRegion {
  switch (status) {
    case 'saved':
      return 'status';
    case 'failed':
      return 'alert';
    case 'idle':
    case 'saving':
      return 'none';
  }
}

export function UpdateUserNameOutcome({ status }: UpdateUserNameOutcomeProps): ReactElement {
  const { t } = useTranslation();
  const region = toOutcomeRegion(status);

  return (
    <>
      <output className="text-sm text-muted-foreground">
        {region === 'status' ? t('updateUserName.saved') : ''}
      </output>
      <p className="text-sm text-destructive" role="alert">
        {region === 'alert' ? t('updateUserName.failed') : ''}
      </p>
    </>
  );
}
