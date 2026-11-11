import { useTranslation } from '@/shared/i18n';

export function RoutePendingPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto max-w-md p-8">
      <output className="text-sm text-muted-foreground">{t('routePending.loading')}</output>
    </main>
  );
}
