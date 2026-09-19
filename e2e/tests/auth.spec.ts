import { test, expect } from '@playwright/test';

test.describe('Authentication & Access Flows', () => {
  test('login page elements render correctly', async ({ page }) => {
    await page.goto('/login');

    // Branding header check
    await expect(page.locator('h1.auth-brand-title')).toHaveText('Stovo');

    // Input fields check
    const nicknameInput = page.getByLabel(/Nickname/i);
    const passwordInput = page.getByLabel(/Password/i);
    const submitBtn = page.getByRole('button', { name: /Sign in|Log in|Submit/i });

    await expect(nicknameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('invalid login credentials show appropriate error message', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/Nickname/i).fill('nonexistent_user_xyz');
    await page.getByLabel(/Password/i).fill('invalid_password_123');
    await page.locator('form').getByRole('button').click();

    // Verify error banner / toast appears
    const errorNotice = page.locator('.error-banner, .form-error, .error-text, [role="alert"]');
    await expect(errorNotice).toBeVisible({ timeout: 10000 });
  });

  test('unauthenticated users are redirected from protected app paths', async ({ page }) => {
    await page.goto('/app/chats');

    // Should redirect to login page when not authenticated
    await page.waitForURL(/\/(login|setup)/);
    expect(page.url()).toMatch(/\/(login|setup)/);
  });
});
