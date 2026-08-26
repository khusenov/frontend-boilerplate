import { useState } from 'react';

import { formatDuration } from '@/shared/lib/format-duration';

import './home-page.css';

const TICK_MILLISECONDS = 1_000;

interface HomePageProps {
  name: string;
  mode: string;
  apiBaseUrl: string;
}

export function HomePage({ name, mode, apiBaseUrl }: HomePageProps) {
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);

  return (
    <main className="home">
      <h1>{name}</h1>
      <p className="home__env">
        mode: <code>{mode}</code> <span aria-hidden="true">·</span> api: <code>{apiBaseUrl}</code>
      </p>
      <output className="home__elapsed">{formatDuration(elapsedMilliseconds)}</output>
      <button
        type="button"
        onClick={() => {
          setElapsedMilliseconds((previous) => previous + TICK_MILLISECONDS);
        }}
      >
        Add one second
      </button>
    </main>
  );
}
