import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_LOCALE, isSupportedLocale, LOCALES } from './registry';
import type { Locale, TextDirection } from './registry';

export interface UseLocaleResult {
  readonly locale: Locale;
  readonly dir: TextDirection;
  readonly setLocale: (next: Locale) => void;
}

export function useLocale(): UseLocaleResult {
  const { i18n } = useTranslation(undefined, { useSuspense: false });
  const resolved = i18n.resolvedLanguage;
  const locale = isSupportedLocale(resolved) ? resolved : DEFAULT_LOCALE;

  const setLocale = useCallback(
    (next: Locale) => {
      void i18n.changeLanguage(next);
    },
    [i18n],
  );

  return { locale, dir: LOCALES[locale].dir, setLocale };
}
