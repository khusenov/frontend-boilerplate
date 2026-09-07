import { useId } from 'react';
import type { ReactNode } from 'react';

import type { UserNameChange } from '@/entities/user';
import { useTranslation } from '@/shared/i18n';
import { useAppForm } from '@/shared/ui/form';

import type { UserNameChangeSchema } from '../model/user-name-change-schema';

interface UpdateUserNameFormViewProps {
  readonly defaultValues: UserNameChange;
  readonly schema: UserNameChangeSchema;
  readonly outcome: ReactNode;
  readonly onSubmit: (change: UserNameChange) => Promise<void>;
  readonly onEdited: () => void;
}

export function UpdateUserNameFormView({
  defaultValues,
  onEdited,
  onSubmit,
  outcome,
  schema,
}: UpdateUserNameFormViewProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const form = useAppForm({
    defaultValues,
    validators: { onChange: schema },
    listeners: { onChange: onEdited },
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form.AppForm>
      <form.Form aria-labelledby={headingId} className="grid gap-4">
        <h2 className="text-lg font-medium" id={headingId}>
          {t('updateUserName.formLabel')}
        </h2>
        <form.AppField name="firstName">
          {(field) => (
            <field.TextField autoComplete="given-name" label={t('updateUserName.firstName')} />
          )}
        </form.AppField>
        <form.AppField name="lastName">
          {(field) => (
            <field.TextField autoComplete="family-name" label={t('updateUserName.lastName')} />
          )}
        </form.AppField>
        <form.SubmitButton pendingLabel={t('updateUserName.saving')}>
          {t('updateUserName.save')}
        </form.SubmitButton>
        {outcome}
      </form.Form>
    </form.AppForm>
  );
}
