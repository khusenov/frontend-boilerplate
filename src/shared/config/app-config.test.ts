import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig() {
  const { appConfig } = await import('./app-config');
  return appConfig;
}

describe('appConfig', () => {
  it('uses VITE_API_BASE_URL when it is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');

    await expect(loadConfig()).resolves.toMatchObject({
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('falls back to /v1 when VITE_API_BASE_URL is unset', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);

    await expect(loadConfig()).resolves.toMatchObject({ apiBaseUrl: '/v1' });
  });

  it('falls back to /v1 when VITE_API_BASE_URL is blank', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    await expect(loadConfig()).resolves.toMatchObject({ apiBaseUrl: '/v1' });
  });

  it('falls back to /v1 when VITE_API_BASE_URL is whitespace only', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '   ');

    await expect(loadConfig()).resolves.toMatchObject({ apiBaseUrl: '/v1' });
  });

  it('trims surrounding whitespace from VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '  https://api.example.test  ');

    await expect(loadConfig()).resolves.toMatchObject({
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('exposes the current vite mode', async () => {
    await expect(loadConfig()).resolves.toMatchObject({ mode: 'test' });
  });
});
