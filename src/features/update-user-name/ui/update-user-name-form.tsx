import type { User } from '@/entities/user';
import { useTranslation } from '@/shared/i18n';

import { useUpdateUserName } from '../model/use-update-user-name';
import { useUserNameChangeSchema } from '../model/use-user-name-change-schema';

import { UpdateUserNameAlert } from './update-user-name-alert';
import { UpdateUserNameFormView } from './update-user-name-form-view';

interface UpdateUserNameFormProps {
  readonly user: Pick<User, 'firstName' | 'id' | 'lastName'>;
}

export function UpdateUserNameForm({ user }: UpdateUserNameFormProps) {
  const { t } = useTranslation();
  const { dismissOutcome, status, submit } = useUpdateUserName(user.id, {
    savedMessage: t('updateUserName.saved'),
  });
  const schema = useUserNameChangeSchema();

  return (
    <UpdateUserNameFormView
      defaultValues={{ firstName: user.firstName, lastName: user.lastName }}
      onEdited={dismissOutcome}
      onSubmit={submit}
      outcome={<UpdateUserNameAlert status={status} />}
      schema={schema}
    />
  );
}
