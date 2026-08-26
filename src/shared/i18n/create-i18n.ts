import { createInstance } from 'i18next';
import type { i18n as I18nInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';

import { BUNDLED_RESOURCES } from './bundled-resources';
import { loadLocaleNamespace } from './lazy-locale-loader';
import { DEFAULT_LOCALE, DEFAULT_NAMESPACE, SUPPORTED_LOCALES } from './registry';
import type { Locale } from './registry';

const LOCALE_STORAGE_KEY = 'app.locale';
const LOCALE_QUERY_PARAMETER = 'lng';

export interface LocaleDetectionOptions {
  readonly order: readonly string[];
  readonly caches: readonly string[];
}

const DEFAULT_DETECTION: LocaleDetectionOptions = {
  order: ['querystring', 'localStorage', 'navigator'],
  caches: ['localStorage'],
};

export interface CreateI18nOptions {
  readonly locale?: Locale;
  readonly detection?: Partial<LocaleDetectionOptions>;
}

export function createI18n(options: CreateI18nOptions = {}): I18nInstance {
  const instance = createInstance();
  const detection = { ...DEFAULT_DETECTION, ...options.detection };

  void instance
    .use(LanguageDetector)
    .use(resourcesToBackend(loadLocaleNamespace))
    .init({
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      load: 'languageOnly',
      defaultNS: DEFAULT_NAMESPACE,
      ns: [DEFAULT_NAMESPACE],
      resources: BUNDLED_RESOURCES,
      partialBundledLanguages: true,
      initAsync: false,
      interpolation: { escapeValue: false },
      detection: {
        order: [...detection.order],
        caches: [...detection.caches],
        lookupQuerystring: LOCALE_QUERY_PARAMETER,
        lookupLocalStorage: LOCALE_STORAGE_KEY,
      },
      ...(options.locale === undefined ? {} : { lng: options.locale }),
    });

  return instance;
}
