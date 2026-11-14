import { test, expect } from './fixtures';

test('Stovo Spaces title sits on the same row as the Stovo logo on the login card', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.removeItem('master_admin_token');
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({ themeMode: 'dark' }));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'en' }));
  });

  await page.goto('/multi-admin');
  const headerRow = page.locator('.supervisor-login-header');
  await expect(headerRow).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const logoBox = (await headerRow.locator('img[alt="Stovo logo"]').boundingBox())!;
  const titleBox = (await headerRow.locator('h1').boundingBox())!;

  expect(logoBox).toBeTruthy();
  expect(titleBox).toBeTruthy();
  // Logo and title are side by side horizontally (title starts to the right of logo)
  expect(titleBox.x).toBeGreaterThan(logoBox.x + logoBox.width - 1);
  // Logo and title are vertically aligned on the same row
  const logoCenterY = logoBox.y + logoBox.height / 2;
  const titleCenterY = titleBox.y + titleBox.height / 2;
  expect(Math.abs(logoCenterY - titleCenterY)).toBeLessThanOrEqual(4);

  await page.screenshot({ path: testInfo.outputPath('multi-admin-login.png'), animations: 'disabled' });
});
