import { env } from 'node:process';

import { defineConfig, devices } from '@playwright/test';

import { API_PREFIX } from './e2e/fixtures/http-contract';

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;
const WEB_SERVER_TIMEOUT_MILLISECONDS = 120_000;

const isContinuousIntegration = Boolean(env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: PREVIEW_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PREVIEW_PORT)} --strictPort`,
    env: { VITE_API_BASE_URL: API_PREFIX },
    url: PREVIEW_URL,
    reuseExistingServer: false,
    stdout: 'pipe',
    timeout: WEB_SERVER_TIMEOUT_MILLISECONDS,
  },
});
