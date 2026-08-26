import { Link } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.description')}</p>
      <Link to="/">{t('notFound.backToHome')}</Link>
    </main>
  );
}
