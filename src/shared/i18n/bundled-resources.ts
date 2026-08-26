import type { ResourceKey } from 'i18next';

import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import ruCommon from './locales/ru/common.json';
import type { DEFAULT_NAMESPACE, Locale, Namespace } from './registry';

export const BUNDLED_RESOURCES = {
  en: { common: enCommon, home: enHome },
  ru: { common: ruCommon },
} as const satisfies Record<
  Locale,
  Partial<Record<Namespace, ResourceKey>> & Record<typeof DEFAULT_NAMESPACE, ResourceKey>
>;
