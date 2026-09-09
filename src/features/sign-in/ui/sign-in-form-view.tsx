import type { ReactNode } from 'react';

import type { Credentials } from '@/entities/session';
import { useTranslation } from '@/shared/i18n';
import { useAppForm } from '@/shared/ui/form';

import type { CredentialsSchema } from '../model/credentials-schema';

const EMPTY_CREDENTIALS: Credentials = { email: '', password: '' };

interface SignInFormViewProps {
  readonly schema: CredentialsSchema;
  readonly outcome: ReactNode;
  readonly onSubmit: (credentials: Credentials) => Promise<void>;
  readonly onEdited: () => void;
}

export function SignInFormView({ onEdited, onSubmit, outcome, schema }: SignInFormViewProps) {
  const { t } = useTranslation();
  const form = useAppForm({
    defaultValues: EMPTY_CREDENTIALS,
    validators: { onChange: schema },
    listeners: { onChange: onEdited },
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form.AppForm>
      <form.Form aria-label={t('signIn.formLabel')} className="grid gap-4">
        <form.AppField name="email">
          {(field) => (
            <field.TextField autoComplete="username" label={t('signIn.email')} type="email" />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              autoComplete="current-password"
              label={t('signIn.password')}
              type="password"
            />
          )}
        </form.AppField>
        <form.SubmitButton pendingLabel={t('signIn.submitting')}>
          {t('signIn.submit')}
        </form.SubmitButton>
        {outcome}
      </form.Form>
    </form.AppForm>
  );
}
