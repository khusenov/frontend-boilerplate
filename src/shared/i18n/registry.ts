export type TextDirection = 'ltr' | 'rtl';

export interface LocaleDescriptor {
  readonly label: string;
  readonly dir: TextDirection;
}

export const SUPPORTED_LOCALES = ['en', 'ru'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE = 'en' satisfies Locale;

export const LOCALES = {
  en: { label: 'English', dir: 'ltr' },
  ru: { label: 'Русский', dir: 'ltr' },
} as const satisfies Record<Locale, LocaleDescriptor>;

const SUPPORTED_LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES);

export function isSupportedLocale(value: string | undefined): value is Locale {
  return value !== undefined && SUPPORTED_LOCALE_SET.has(value);
}

export const NAMESPACES = ['common', 'home'] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;
