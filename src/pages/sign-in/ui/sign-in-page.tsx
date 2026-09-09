import { SignInForm } from '@/features/sign-in';
import { useTranslation } from '@/shared/i18n';

interface SignInPageProps {
  readonly onSignedIn: () => void;
}

export function SignInPage({ onSignedIn }: SignInPageProps) {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('signIn.title')}</h1>
      <SignInForm onSignedIn={onSignedIn} />
    </main>
  );
}
