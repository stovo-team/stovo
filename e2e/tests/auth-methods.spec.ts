import { expect, test } from '@playwright/test';

test.describe('Web authentication methods', () => {
  test('keeps password as the default and exposes passkey and QR as alternatives', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/nickname/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /passkey/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /QR code/i })).toBeVisible();
  });

  test('starts a QR request and shows a waiting state without replacing password login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /QR code/i }).click();

    await expect(page.getByText(/scan this code with stovo/i)).toBeVisible();
    await expect(page.getByText(/waiting for approval/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('passkey unavailability does not block password login', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: undefined });
    });
    await page.goto('/login');

    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeEnabled();
    await expect(page.getByText(/passkey.*(unavailable|unsupported|secure connection)/i)).toBeVisible();
  });

  test('guest invite offers password or passkey and never QR sign-in', async ({ page }) => {
    await page.route('**/api/invites/e2e-auth-method-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          familyName: 'Authentication E2E Space',
          role: 'member',
          expiresAt: '2030-01-01T00:00:00Z',
          usesRemaining: 1,
        }),
      });
    });
    await page.goto('/invite/e2e-auth-method-token');

    await expect(page.getByRole('heading', { name: 'Authentication E2E Space' })).toBeVisible();
    await expect(page.getByRole('button', { name: /create a password/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create a passkey/i })).toBeVisible();
    await expect(page.getByText(/QR code/i)).toHaveCount(0);

    await page.getByRole('button', { name: /create a passkey/i }).click();
    await expect(page.locator('input[autocomplete="new-password"]')).toHaveCount(0);
    await expect(page.getByText(/passkey registration/i)).toBeVisible();

    await page.getByRole('button', { name: /create a password/i }).click();
    await expect(page.locator('input[autocomplete="new-password"]')).toBeVisible();
  });
});
