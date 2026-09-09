import { useCredentialsSchema } from '../model/use-credentials-schema';
import { useSignIn } from '../model/use-sign-in';

import { SignInAlert } from './sign-in-alert';
import { SignInFormView } from './sign-in-form-view';

interface SignInFormProps {
  readonly onSignedIn: () => void;
}

export function SignInForm({ onSignedIn }: SignInFormProps) {
  const { dismissOutcome, status, submit } = useSignIn({ onSignedIn });
  const schema = useCredentialsSchema();

  return (
    <SignInFormView
      onEdited={dismissOutcome}
      onSubmit={submit}
      outcome={<SignInAlert status={status} />}
      schema={schema}
    />
  );
}
