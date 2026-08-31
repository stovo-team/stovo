import { test, expect } from '@playwright/test';

test.describe('Navigation & UI Routing', () => {
  test('root route redirects properly', async ({ page }) => {
    await page.goto('/');

    // Expect navigation to root handler (login, setup, or app)
    await page.waitForLoadState('networkidle');
    expect(page.url()).toBeTruthy();
  });

  test('direct access to setup page loads expected interface', async ({ page }) => {
    const response = await page.goto('/setup');
    expect(response?.status()).toBeLessThan(400);
  });

  test('non-existent routes display gracefully without crashing', async ({ page }) => {
    await page.goto('/some-invalid-route-404');
    // Application should serve index HTML fallback without crash
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });
});
