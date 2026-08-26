import type enCommon from './locales/en/common.json';
import type enHome from './locales/en/home.json';
import type { DEFAULT_NAMESPACE } from './registry';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    returnNull: false;
    resources: {
      common: typeof enCommon;
      home: typeof enHome;
    };
  }
}
