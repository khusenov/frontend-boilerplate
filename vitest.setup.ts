import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { setI18n } from 'react-i18next';
import { afterEach, beforeEach, vi } from 'vitest';

import { createI18n, DEFAULT_LOCALE } from '@/shared/i18n';

const isBrowserEnvironment = typeof window !== 'undefined';

vi.stubGlobal('scrollTo', vi.fn());

beforeEach(() => {
  if (!isBrowserEnvironment) {
    return;
  }

  localStorage.clear();
  setI18n(createI18n({ locale: DEFAULT_LOCALE, detection: { order: [], caches: [] } }));
});

afterEach(() => {
  cleanup();

  if (!isBrowserEnvironment) {
    return;
  }

  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});
