import { useTranslation } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';

interface SignOutButtonViewProps {
  readonly isSigningOut: boolean;
  readonly onSignOut: () => void;
}

export function SignOutButtonView({ isSigningOut, onSignOut }: SignOutButtonViewProps) {
  const { t } = useTranslation();

  return (
    <Button variant="outline" aria-busy={isSigningOut} disabled={isSigningOut} onClick={onSignOut}>
      {isSigningOut ? t('signOut.inProgress') : t('signOut.action')}
    </Button>
  );
}
