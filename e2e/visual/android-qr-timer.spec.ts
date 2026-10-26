import {test, expect} from './fixtures';
import {prepareVisualScenario, screenshot, type Scenario} from './scenarios';

async function openProfileQr(page: import('@playwright/test').Page, locale: 'en' | 'ru') {
  await prepareVisualScenario(page, {
    id: locale === 'ru' ? 'V-14' : 'V-13',
    viewport: locale === 'ru' ? {width: 390, height: 844} : {width: 1440, height: 900},
    theme: locale === 'ru' ? 'dark' : 'light',
    locale,
  }, '/app/settings');
  await page.getByRole('button', {name: locale === 'ru' ? 'Открыть настройки профиля' : 'Open profile settings'}).click();
  const qrPanel = page.locator('.profile-detail-form').filter({has: page.getByRole('heading', {name: locale === 'ru' ? 'QR-код для входа на Android' : 'Android sign-in QR'})});
  await qrPanel.scrollIntoViewIfNeeded();
  await qrPanel.getByRole('button', {name: locale === 'ru' ? 'Создать QR-код для входа на Android' : 'Create Android sign-in QR'}).click();
  await expect(qrPanel.locator('.android-qr-code')).toBeVisible();
  return qrPanel;
}

const activeScenario: Scenario = {id: 'V-13', viewport: {width: 1440, height: 900}, theme: 'light', locale: 'en'};
const expiredScenario: Scenario = {id: 'V-14', viewport: {width: 390, height: 844}, theme: 'dark', locale: 'ru'};

test('V-13 Android sign-in QR shows a live two-minute timer', async ({page}, info) => {
  const qrPanel = await openProfileQr(page, 'en');
  await expect(qrPanel.getByRole('timer')).toContainText('QR expires in: 02:00');
  await screenshot(page, info, activeScenario);
});

test('V-14 Android sign-in QR disappears when its timer expires', async ({page}, info) => {
  const qrPanel = await openProfileQr(page, 'ru');
  await expect(qrPanel.getByRole('timer')).toContainText('QR-код исчезнет через: 02:00');
  await page.evaluate(() => { Date.now = () => Date.parse('2026-10-19T06:02:00.000Z') + 1; });
  await expect(qrPanel.locator('.android-qr-code')).toHaveCount(0);
  await expect(qrPanel.getByRole('timer')).toHaveCount(0);
  await expect(qrPanel.getByRole('button', {name: 'Создать QR-код для входа на Android'})).toBeVisible();
  await screenshot(page, info, expiredScenario);
});
