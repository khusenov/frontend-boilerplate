const DEFAULT_API_BASE_URL = '/v1';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

export const appConfig = {
  name: 'frontend-boilerplate',
  mode: import.meta.env.MODE,
  apiBaseUrl: configuredApiBaseUrl === '' ? DEFAULT_API_BASE_URL : configuredApiBaseUrl,
} as const;
