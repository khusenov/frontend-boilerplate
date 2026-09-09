import { useMemo } from 'react';

import { useTranslation } from '@/shared/i18n';

import { createCredentialsSchema } from './credentials-schema';
import type { CredentialsSchema } from './credentials-schema';

export function useCredentialsSchema(): CredentialsSchema {
  const { t } = useTranslation();

  return useMemo(
    () =>
      createCredentialsSchema({
        emailInvalid: t('signIn.validation.emailInvalid'),
        passwordRequired: t('signIn.validation.passwordRequired'),
      }),
    [t],
  );
}
