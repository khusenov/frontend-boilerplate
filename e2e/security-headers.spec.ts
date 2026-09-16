import { expect, test } from './fixtures/harness';

const THEME_STORAGE_KEY = 'app.theme';
const APPLICATION_SCRIPTS = '**/assets/*.js';

test.describe('security headers', () => {
  test('serves every document with the production security headers', async ({ page }) => {
    const response = await page.goto('/users/0198f0a2-7b1c-7d3e-8f00-123456789abc');
    const headers = response?.headers() ?? {};

    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'sha256-[^']+'/);
    expect(headers['content-security-policy']).toMatch(/style-src 'self' 'sha256-[^']+'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('runs the pre-paint theme script under the policy before any bundle loads', async ({
    page,
  }) => {
    await page.addInitScript((storageKey) => {
      localStorage.setItem(storageKey, 'dark');
    }, THEME_STORAGE_KEY);
    await page.route(APPLICATION_SCRIPTS, (route) => route.abort());

    await page.goto('/');

    await expect(page.locator('html')).toHaveClass('dark');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  });
});
