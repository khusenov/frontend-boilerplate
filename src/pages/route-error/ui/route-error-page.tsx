import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { useTranslation } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';

interface RouteErrorPageProps {
  readonly onRetry: () => void;
}

export function RouteErrorPage({ onRetry }: RouteErrorPageProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 p-8">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        {t('routeError.title')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('routeError.description')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry}>{t('routeError.retry')}</Button>
        <Button asChild variant="outline">
          <Link to="/">{t('routeError.backToHome')}</Link>
        </Button>
      </div>
    </main>
  );
}
