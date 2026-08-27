import { useState } from 'react';

import { Trans, useTranslation } from '@/shared/i18n';
import { formatDuration } from '@/shared/lib/format-duration';
import { Button } from '@/shared/ui/button';

const MILLISECONDS_PER_SECOND = 1_000;

interface HomePageProps {
  readonly name: string;
  readonly mode: string;
  readonly apiBaseUrl: string;
}

export function HomePage({ name, mode, apiBaseUrl }: HomePageProps) {
  const { t } = useTranslation('home');
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);
  const elapsedSeconds = elapsedMilliseconds / MILLISECONDS_PER_SECOND;

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      <p className="text-sm text-muted-foreground">
        <Trans i18nKey="environment.mode" t={t} values={{ mode }} components={{ code: <code /> }} />{' '}
        <span aria-hidden="true">·</span>{' '}
        <Trans
          i18nKey="environment.api"
          t={t}
          values={{ apiBaseUrl }}
          components={{ code: <code /> }}
        />
      </p>
      <output className="font-mono text-5xl tabular-nums" aria-label={t('elapsedLabel')}>
        {formatDuration(elapsedMilliseconds)}
      </output>
      <p className="text-sm text-muted-foreground">
        {t('secondsAdded', { count: elapsedSeconds })}
      </p>
      <Button
        onClick={() => {
          setElapsedMilliseconds((previous) => previous + MILLISECONDS_PER_SECOND);
        }}
      >
        {t('addOneSecond')}
      </Button>
    </main>
  );
}
