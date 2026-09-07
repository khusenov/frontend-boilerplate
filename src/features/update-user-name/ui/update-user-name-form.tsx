import type { User } from '@/entities/user';

import { useUpdateUserName } from '../model/use-update-user-name';
import { useUserNameChangeSchema } from '../model/use-user-name-change-schema';

import { UpdateUserNameFormView } from './update-user-name-form-view';
import { UpdateUserNameOutcome } from './update-user-name-outcome';

interface UpdateUserNameFormProps {
  readonly user: Pick<User, 'firstName' | 'id' | 'lastName'>;
}

export function UpdateUserNameForm({ user }: UpdateUserNameFormProps) {
  const { dismissOutcome, status, submit } = useUpdateUserName(user.id);
  const schema = useUserNameChangeSchema();

  return (
    <UpdateUserNameFormView
      defaultValues={{ firstName: user.firstName, lastName: user.lastName }}
      onEdited={dismissOutcome}
      onSubmit={submit}
      outcome={<UpdateUserNameOutcome status={status} />}
      schema={schema}
    />
  );
}
