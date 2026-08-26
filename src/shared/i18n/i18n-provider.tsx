import type { i18n as I18nInstance } from 'i18next';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { useLocale } from './use-locale';

interface I18nProviderProps {
  readonly i18n: I18nInstance;
  readonly children: ReactNode;
}

function DocumentLocaleSync() {
  const { locale, dir } = useLocale();

  useEffect(() => {
    const { documentElement } = document;

    documentElement.lang = locale;
    documentElement.dir = dir;
  }, [locale, dir]);

  return null;
}

export function I18nProvider({ i18n, children }: I18nProviderProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <DocumentLocaleSync />
      {children}
    </I18nextProvider>
  );
}
