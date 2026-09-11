import { useTranslation } from '@/shared/i18n';

export function ResolvingSessionPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('session.resolving')}</h1>
    </main>
  );
}
