import { test as base } from '@playwright/test';
import type { Route } from '@playwright/test';

import { API_ROUTE_PATTERN, NOT_IMPLEMENTED_STATUS } from './http-contract';
import { restoreSession } from './session-stub';
import { createUserStub } from './user-stub';
import type { UserStub } from './user-stub';

async function reportUnhandledRequest(route: Route): Promise<void> {
  const request = route.request();
  const { pathname } = new URL(request.url());

  await route.fulfill({
    status: NOT_IMPLEMENTED_STATUS,
    json: { message: `The end-to-end stub has no handler for ${request.method()} ${pathname}.` },
  });
}

export const test = base.extend<{ userStub: UserStub }>({
  userStub: [
    async ({ page }, use) => {
      const { stub, handle } = createUserStub();

      // Playwright matches routes LIFO, so this registration order is load-bearing: the
      // catch-all must go in first to run last, or it answers 501 before the stubs are tried.
      await page.route(API_ROUTE_PATTERN, reportUnhandledRequest);
      await page.route(API_ROUTE_PATTERN, restoreSession);
      await page.route(API_ROUTE_PATTERN, handle);

      await use(stub);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
