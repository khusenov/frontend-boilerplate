import type { ResourceKey } from 'i18next';

const LAZY_LOCALE_MODULES = import.meta.glob<{ readonly default: ResourceKey }>([
  './locales/*/*.json',
  '!./locales/en/*.json',
  '!./locales/*/common.json',
]);

export async function loadLocaleNamespace(
  language: string,
  namespace: string,
): Promise<ResourceKey> {
  const importLocaleModule = LAZY_LOCALE_MODULES[`./locales/${language}/${namespace}.json`];

  if (importLocaleModule === undefined) {
    throw new Error(`No lazily loadable translations for "${language}/${namespace}".`);
  }

  return (await importLocaleModule()).default;
}
