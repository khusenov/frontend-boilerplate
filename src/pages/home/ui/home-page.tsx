import { useState } from 'react';

import { Trans, useTranslation } from '@/shared/i18n';
import { formatDuration } from '@/shared/lib/format-duration';

import './home-page.css';

const TICK_MILLISECONDS = 1_000;

interface HomePageProps {
  readonly name: string;
  readonly mode: string;
  readonly apiBaseUrl: string;
}

export function HomePage({ name, mode, apiBaseUrl }: HomePageProps) {
  const { t } = useTranslation('home');
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);
  const elapsedSeconds = elapsedMilliseconds / TICK_MILLISECONDS;

  return (
    <main className="home">
      <h1>{name}</h1>
      <p className="home__env">
        <Trans i18nKey="environment.mode" t={t} values={{ mode }} components={{ code: <code /> }} />{' '}
        <span aria-hidden="true">·</span>{' '}
        <Trans
          i18nKey="environment.api"
          t={t}
          values={{ apiBaseUrl }}
          components={{ code: <code /> }}
        />
      </p>
      <output className="home__elapsed" aria-label={t('elapsedLabel')}>
        {formatDuration(elapsedMilliseconds)}
      </output>
      <p className="home__count">{t('secondsAdded', { count: elapsedSeconds })}</p>
      <button
        type="button"
        onClick={() => {
          setElapsedMilliseconds((previous) => previous + TICK_MILLISECONDS);
        }}
      >
        {t('addOneSecond')}
      </button>
    </main>
  );
}
