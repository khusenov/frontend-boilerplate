import { useSignOut } from '../model/use-sign-out';

import { SignOutButtonView } from './sign-out-button-view';

interface SignOutButtonProps {
  readonly onSignedOut: () => void;
}

export function SignOutButton({ onSignedOut }: SignOutButtonProps) {
  const { isSigningOut, signOut } = useSignOut({ onSignedOut });

  return (
    <SignOutButtonView
      isSigningOut={isSigningOut}
      onSignOut={() => {
        void signOut();
      }}
    />
  );
}
