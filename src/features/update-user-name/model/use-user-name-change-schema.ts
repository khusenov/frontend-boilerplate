import { useMemo } from 'react';

import { useTranslation } from '@/shared/i18n';

import { createUserNameChangeSchema, MAXIMUM_NAME_LENGTH } from './user-name-change-schema';
import type { UserNameChangeSchema } from './user-name-change-schema';

export function useUserNameChangeSchema(): UserNameChangeSchema {
  const { t } = useTranslation();

  return useMemo(
    () =>
      createUserNameChangeSchema({
        firstNameRequired: t('updateUserName.validation.firstNameRequired'),
        lastNameRequired: t('updateUserName.validation.lastNameRequired'),
        nameTooLong: t('updateUserName.validation.nameTooLong', { max: MAXIMUM_NAME_LENGTH }),
      }),
    [t],
  );
}
