// The refresh response shape is a pinned copy of the backend's POST /v1/auth/refresh contract —
// deliberately NOT imported from src/entities/session/api/session-dto.ts. If the two disagree, one
// of them is wrong, and finding that out is the entire purpose of this suite. Do not DRY this away.

import type { Route } from '@playwright/test';

import { API_PREFIX, OK_STATUS } from './http-contract';

const REFRESH_PATH = `${API_PREFIX}/auth/refresh`;
const REFRESH_METHOD = 'POST';
const RESTORED_ACCESS_TOKEN = 'e2e.restored.access.token';

export async function restoreSession(route: Route): Promise<void> {
  const request = route.request();
  const { pathname } = new URL(request.url());

  if (request.method() !== REFRESH_METHOD || pathname !== REFRESH_PATH) {
    await route.fallback();
    return;
  }

  await route.fulfill({ status: OK_STATUS, json: { accessToken: RESTORED_ACCESS_TOKEN } });
}
