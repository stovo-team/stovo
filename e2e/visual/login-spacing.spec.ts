import { test, expect } from './fixtures';

async function openLogin(page: import('@playwright/test').Page) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({ themeMode: 'dark' }));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'en' }));
  });
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: { detail: 'No session' } }));
  await page.route('**/api/auth/setup-status', route => route.fulfill({ json: { setupRequired: false, familyName: 'Stovo' } }));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('divider is centered vertically between sign in and alternative methods', async ({ page }, testInfo) => {
  await openLogin(page);
  const signIn = (await page.getByRole('button', { name: 'Sign In', exact: true }).boundingBox())!;
  const divider = (await page.locator('.auth-divider').boundingBox())!;
  const alternatives = (await page.locator('.auth-method-grid').boundingBox())!;
  const center = divider.y + divider.height / 2;
  await page.screenshot({ path: testInfo.outputPath('login.png'), animations: 'disabled' });
  expect(Math.abs((center - (signIn.y + signIn.height)) - (alternatives.y - center))).toBeLessThanOrEqual(1);
});

test('login error has red background and space above it', async ({ page }, testInfo) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { detail: 'Invalid credentials' } }));
  await openLogin(page);
  await page.locator('input[autocomplete="username"]').fill('example');
  await page.locator('input[autocomplete="current-password"]').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const error = page.locator('.auth-error');
  await expect(error).toBeVisible();
  const signIn = (await page.getByRole('button', { name: 'Sign In', exact: true }).boundingBox())!;
  const errorBox = (await error.boundingBox())!;
  const rgb = await error.evaluate(el => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el).backgroundColor; ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  });
  await page.screenshot({ path: testInfo.outputPath('login-error.png'), animations: 'disabled' });
  expect(errorBox.y - (signIn.y + signIn.height)).toBeGreaterThanOrEqual(12);
  expect(rgb[0]).toBeGreaterThan(rgb[1]);
  expect(rgb[0]).toBeGreaterThan(rgb[2]);
});

test('filled sign in button retains its appearance on hover', async ({ page }) => {
  await openLogin(page);
  const button = page.getByRole('button', { name: 'Sign In', exact: true });
  const before = await button.evaluate(el => getComputedStyle(el).backgroundColor);
  await button.hover();
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(before);
});
