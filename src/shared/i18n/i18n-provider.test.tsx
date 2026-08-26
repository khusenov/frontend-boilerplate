import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import type { i18n as I18nInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BUNDLED_RESOURCES } from './bundled-resources';
import { createI18n } from './create-i18n';
import { I18nProvider } from './i18n-provider';
import { loadLocaleNamespace } from './lazy-locale-loader';
import { DEFAULT_LOCALE, DEFAULT_NAMESPACE } from './registry';
import { useLocale } from './use-locale';

const withoutDetection = { order: [], caches: [] };

function createUnreachableShellI18n(): I18nInstance {
  const instance = createInstance();

  void instance.use(resourcesToBackend(loadLocaleNamespace)).init({
    lng: 'de',
    fallbackLng: false,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [DEFAULT_NAMESPACE],
    resources: BUNDLED_RESOURCES,
    partialBundledLanguages: true,
    initAsync: false,
    interpolation: { escapeValue: false },
  });

  return instance;
}

function ShellCopy() {
  const { t } = useTranslation();

  return <p>{t('notFound.title')}</p>;
}

function LocaleSwitch() {
  const { setLocale } = useLocale();

  return (
    <button
      type="button"
      onClick={() => {
        setLocale('ru');
      }}
    >
      switch
    </button>
  );
}

describe('I18nProvider', () => {
  it('renders its children', () => {
    render(
      <I18nProvider i18n={createI18n({ locale: DEFAULT_LOCALE, detection: withoutDetection })}>
        <p>child content</p>
      </I18nProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders children even when the active locale has no reachable shell copy', () => {
    render(
      <I18nProvider i18n={createUnreachableShellI18n()}>
        <p>child content</p>
      </I18nProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('resolves copy through the injected instance rather than the global one', () => {
    render(
      <I18nProvider i18n={createI18n({ locale: 'ru', detection: withoutDetection })}>
        <ShellCopy />
      </I18nProvider>,
    );

    expect(screen.getByText('Страница не найдена')).toBeInTheDocument();
  });

  it('marks the document with the active locale and its direction', () => {
    render(
      <I18nProvider i18n={createI18n({ locale: 'ru', detection: withoutDetection })}>
        <p>child content</p>
      </I18nProvider>,
    );

    expect(document.documentElement.lang).toBe('ru');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('updates the document attributes when the locale changes', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider i18n={createI18n({ locale: DEFAULT_LOCALE, detection: withoutDetection })}>
        <LocaleSwitch />
      </I18nProvider>,
    );

    expect(document.documentElement.lang).toBe(DEFAULT_LOCALE);

    await user.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ru');
    });
    expect(document.documentElement.dir).toBe('ltr');
  });
});
