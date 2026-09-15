import { expect, test } from './fixtures/harness';

test.describe('application shell', () => {
  test('renders the not-found page for an unknown route and links home', async ({ page }) => {
    await page.goto('/no-such-page');

    await expect(page.getByText('Page not found')).toBeVisible();

    await page.getByRole('link', { name: 'Back to home' }).click();

    await expect(page).toHaveURL('/');

    await expect(page.getByRole('banner')).toBeVisible();
  });
});
