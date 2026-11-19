import { expect, test } from '@playwright/test';

test('mobile admin settings and members keep text above controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'ru' }));
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({ themeMode: 'dark' }));
  });
  await page.goto('/app/admin/server-settings');
  const row = page.locator('.appearance-setting-row').filter({ hasText: 'Отключать' }).first();
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  const text = await row.locator('span').filter({ has: page.locator('strong') }).first().boundingBox();
  const control = await row.locator('.server-settings-select').boundingBox();
  expect(text!.width).toBeGreaterThan(200);
  expect(control!.y).toBeGreaterThanOrEqual(text!.y + text!.height);

  await page.goto('/app/admin/members');
  const member = page.locator('.admin-member-row--manage').first();
  await expect(member).toBeVisible();
  const copy = await member.locator('.admin-member-copy').boundingBox();
  const actions = await member.locator('.admin-member-actions').boundingBox();
  expect(copy!.width).toBeGreaterThan(200);
  expect(actions!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
});

test('mobile role premium labels stay readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'ru' }));
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({ themeMode: 'dark' }));
  });
  await page.goto('/app/admin/roles');
  await page.getByRole('button', { name: 'Создать роль' }).click();
  const group = page.locator('.admin-role-premium-group').first();
  await expect(group).toBeVisible();
  await expect(group).toHaveCSS('border-top-width', '0px');
  await group.scrollIntoViewIfNeeded();
  const badge = group.locator('.premium-feature-badge');
  const label = group.locator('.admin-role-premium-all > span');
  const dimensions = await badge.evaluate((element) => ({ width: element.getBoundingClientRect().width, scrollWidth: element.scrollWidth, height: element.getBoundingClientRect().height }));
  expect(dimensions.width).toBeGreaterThanOrEqual(dimensions.scrollWidth);
  expect(dimensions.height).toBeLessThan(30);
  expect((await label.boundingBox())!.width).toBeGreaterThan(25);
});

test('native layout remains mobile above browser breakpoints', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 844 });
  await page.goto('/app/admin/server-settings');
  const row = page.locator('.appearance-setting-row').filter({ has: page.locator('.server-settings-select') }).first();
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS('display', 'flex');
  await page.evaluate(() => { document.documentElement.dataset.platform = 'native'; });
  await expect(row).toHaveCSS('display', 'grid');

  await page.goto('/app/admin/members');
  await page.evaluate(() => { document.documentElement.dataset.platform = 'native'; });
  const actions = page.locator('.admin-member-row--manage .admin-member-actions').first();
  await expect(actions).toHaveCSS('grid-column-start', '2');

  await page.goto('/app/admin/roles');
  await page.getByRole('button', { name: /create role/i }).click();
  await page.evaluate(() => { document.documentElement.dataset.platform = 'native'; });
  const group = page.locator('.admin-role-premium-group').first();
  await expect(group.locator('.admin-role-permission-group-heading')).toHaveCSS('flex-wrap', 'wrap');
  await expect(group.locator('.admin-role-premium-all')).toHaveCSS('display', 'grid');
});
