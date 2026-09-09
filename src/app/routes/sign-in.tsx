import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { SignInPage } from '@/pages/sign-in';

function SignInRoute() {
  const navigate = useNavigate();

  return (
    <SignInPage
      onSignedIn={() => {
        void navigate({ to: '/' });
      }}
    />
  );
}

export const Route = createFileRoute('/sign-in')({
  component: SignInRoute,
});
