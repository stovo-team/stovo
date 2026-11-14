import { expect, ready, test } from './fixtures';
import { screenshot } from './scenarios';

test('Storage video preview shows clickable Download video button without spinner when auto-download is skipped', async ({ page }, testInfo) => {
  const scenario = {
    id: 'V-VIDEO-DOWNLOAD-BTN',
    viewport: { width: 1440, height: 900 },
    theme: 'dark' as const,
    locale: 'en' as const,
    state: 'video-download-button',
  };

  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({ colorScheme: scenario.theme });
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({ themeMode: 'dark', autoDownloadMedia: false }));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'en' }));
  });

  await page.goto('/app/files');
  await ready(page);

  await page.getByRole('button', { name: /Storage preview video\.webm/ }).click();

  const downloadButton = page.locator('button.video-player-download-button');
  await expect(downloadButton).toBeVisible();
  await expect(downloadButton).toHaveText('Download video');
  await expect(downloadButton).toHaveCSS('pointer-events', 'auto');

  const beforeContent = await downloadButton.evaluate((el) => getComputedStyle(el, '::before').content);
  expect(beforeContent).toBe('none');

  await screenshot(page, testInfo, scenario);

  await downloadButton.click();
  await expect(downloadButton).toBeHidden();
  await expect(page.locator('.video-player video')).toHaveAttribute('src', /^blob:/);
});
